import { app, BrowserWindow, ipcMain, Menu, nativeImage, net, Notification, screen, session, Tray } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { alertTriggered, formatAlert, isAllowedMarketDataUrl, marketFreshnessMs } from '../shared/domain'
import type { AlertEvent, AppSettings, ProviderStatus, QuoteTick } from '../shared/types'
import { MarketHub, type MarketHubOptions } from './market-hub'
import { mateEngineStatus, startMateEngine, stopMateEngine } from './mate-engine'
import { SettingsStore } from './settings-store'
import { clampWindowPosition, containsPoint, parseInteractiveRegions, validPoint, type InteractiveRegion } from './window-interaction'

const currentDir = dirname(fileURLToPath(import.meta.url))
const collapsedSize = { width: 380, height: 540 }
const expandedSize = { width: 960, height: 680 }
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let store: SettingsStore
let market: MarketHub
let quitting = false
let moveTimer: NodeJS.Timeout | undefined
let pointerTimer: NodeJS.Timeout | undefined
let interactiveRegions: InteractiveRegion[] = []
let ignoringMouse = false
let windowDrag: { pointer: { x: number; y: number }; bounds: Electron.Rectangle } | undefined

if (process.env.FINPET_E2E_USER_DATA) app.setPath('userData', process.env.FINPET_E2E_USER_DATA)
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

function createWindow(): BrowserWindow {
  const settings = store.get()
  const area = screen.getPrimaryDisplay().workArea
  const size = settings.panelOpen ? expandedSize : collapsedSize
  const fallback = { x: area.x + area.width - size.width - 24, y: area.y + area.height - size.height - 24 }
  const requestedPosition = settings.windowPosition ?? fallback
  const displayArea = screen.getDisplayMatching({ ...requestedPosition, ...size }).workArea
  const position = {
    x: Math.max(displayArea.x, Math.min(requestedPosition.x, displayArea.x + displayArea.width - size.width)),
    y: Math.max(displayArea.y, Math.min(requestedPosition.y, displayArea.y + displayArea.height - size.height))
  }
  const iconPath = app.isPackaged ? join(process.resourcesPath, 'tray.png') : join(app.getAppPath(), 'build', 'icon.png')

  const window = new BrowserWindow({
    ...size,
    ...position,
    minWidth: collapsedSize.width,
    minHeight: collapsedSize.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: settings.alwaysOnTop,
    hasShadow: false,
    icon: iconPath,
    webPreferences: {
      preload: join(currentDir, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.setMenu(null)
  // Electron 43's Windows taskbar placement can drop the default floating level.
  window.setAlwaysOnTop(settings.alwaysOnTop, 'pop-up-menu')
  ignoringMouse = settings.clickThrough && !settings.panelOpen
  window.setIgnoreMouseEvents(ignoringMouse)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) window.showInactive()
  })
  window.on('move', () => {
    if (moveTimer) clearTimeout(moveTimer)
    moveTimer = setTimeout(() => {
      if (!window.isDestroyed()) {
        const [x, y] = window.getPosition()
        store.update({ windowPosition: { x, y } })
      }
    }, 250)
  })
  window.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      window.hide()
    }
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) void window.loadURL(rendererUrl)
  else void window.loadFile(join(currentDir, '../renderer/index.html'))
  return window
}

function updateWindowMode(panelOpen: boolean): void {
  if (!mainWindow) return
  const oldBounds = mainWindow.getBounds()
  const size = panelOpen ? expandedSize : collapsedSize
  const display = screen.getDisplayMatching(oldBounds).workArea
  const x = Math.min(Math.max(display.x, oldBounds.x + oldBounds.width - size.width), display.x + display.width - size.width)
  const y = Math.min(Math.max(display.y, oldBounds.y + oldBounds.height - size.height), display.y + display.height - size.height)
  mainWindow.setBounds({ x, y, ...size })
  mainWindow.setSkipTaskbar(!panelOpen)
  windowDrag = undefined
  syncPointerMode()
  mainWindow.show()
}

function syncPointerMode(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const settings = store.get()
  const bounds = mainWindow.getBounds()
  const cursor = screen.getCursorScreenPoint()
  const local = { x: cursor.x - bounds.x, y: cursor.y - bounds.y }
  const overTools = interactiveRegions.some((region) => containsPoint(region, local))
  const ignore = settings.clickThrough && !settings.panelOpen && !overTools
  if (ignore !== ignoringMouse) {
    ignoringMouse = ignore
    mainWindow.setIgnoreMouseEvents(ignore)
  }
}

function updatePointerTracking(): void {
  if (pointerTimer) clearInterval(pointerTimer)
  pointerTimer = undefined
  syncPointerMode()
  // Native cursor tracking keeps the toolbar reachable even while Chromium ignores clicks.
  if (store.get().clickThrough) pointerTimer = setInterval(syncPointerMode, 16)
}

function buildTrayMenu(): Menu {
  const settings = store.get()
  const mate = mateEngineStatus()
  return Menu.buildFromTemplate([
    { label: settings.panelOpen ? '收起面板' : '打开行情面板', click: () => void togglePanel() },
    {
      label: mate.running ? '关闭 Mate-Engine Zome 案例' : mate.installed ? '启动 Mate-Engine Zome 案例' : 'Mate-Engine Zome 案例未安装',
      enabled: mate.installed,
      click: () => {
        if (mate.running) stopMateEngine()
        else startMateEngine()
        refreshTray()
      }
    },
    {
      label: '鼠标穿透', type: 'checkbox', checked: settings.clickThrough,
      click: (item) => void setClickThrough(item.checked)
    },
    {
      label: '总在最前', type: 'checkbox', checked: settings.alwaysOnTop,
      click: (item) => {
        const next = store.update({ alwaysOnTop: item.checked })
        mainWindow?.setAlwaysOnTop(next.alwaysOnTop, 'pop-up-menu')
        emitSettings(next)
      }
    },
    {
      label: '开机启动', type: 'checkbox', checked: settings.launchAtLogin,
      click: (item) => {
        const next = store.update({ launchAtLogin: item.checked })
        applyLaunchAtLogin(next.launchAtLogin)
        emitSettings(next)
      }
    },
    { type: 'separator' },
    { label: '退出 FinPet', click: () => { quitting = true; app.quit() } }
  ])
}

function refreshTray(): void {
  tray?.setContextMenu(buildTrayMenu())
}

function emitSettings(settings: AppSettings): void {
  mainWindow?.webContents.send('settings:changed', settings)
  refreshTray()
}

async function togglePanel(): Promise<boolean> {
  const panelOpen = !store.get().panelOpen
  const settings = store.update({ panelOpen, clickThrough: panelOpen ? false : store.get().clickThrough })
  updateWindowMode(panelOpen)
  updatePointerTracking()
  emitSettings(settings)
  return panelOpen
}

async function setClickThrough(enabled: boolean): Promise<boolean> {
  const settings = store.update({ clickThrough: enabled, panelOpen: enabled ? false : store.get().panelOpen })
  updateWindowMode(settings.panelOpen)
  updatePointerTracking()
  emitSettings(settings)
  return enabled
}

function processAlerts(quotes: QuoteTick[]): void {
  const settings = store.get()
  let changed = false
  for (const alert of settings.alerts) {
    const quote = quotes.find((item) => item.symbol === alert.symbol)
    if (!quote || quote.status !== 'open' || Math.abs(Date.now() - quote.timestamp) > marketFreshnessMs || !alertTriggered(alert, quote)) continue
    alert.lastTriggeredAt = Date.now()
    changed = true
    const event: AlertEvent = { alert, quote, message: formatAlert(alert, quote) }
    mainWindow?.webContents.send('alert:triggered', event)
    if (Notification.isSupported()) new Notification({ title: 'FinPet 价格提醒', body: event.message, silent: !settings.soundEnabled }).show()
  }
  if (changed) emitSettings(store.update({ alerts: settings.alerts }))
}

function applyLaunchAtLogin(enabled: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: ['--hidden'] })
}

function marketOptions(settings: AppSettings): MarketHubOptions {
  const testSource = process.env.FINPET_MARKET_SOURCE
  return {
    source: testSource === 'demo' && process.env.FINPET_E2E_USER_DATA ? 'demo' : settings.marketSource,
    remoteUrl: settings.marketDataUrl || process.env.FINPET_MARKET_WS,
    symbols: settings.watchlist,
    cachePath: join(app.getPath('userData'), 'market-cache.json'),
    request: (url, init) => net.fetch(url, init)
  }
}

function registerIpc(): void {
  ipcMain.handle('app:snapshot', () => ({
    settings: store.get(),
    quotes: market.getQuotes(),
    provider: market.getProvider(),
    providerName: market.getProviderName(),
    providerStatus: market.getStatus()
  }))
  ipcMain.handle('settings:update', (_event, patch: Partial<AppSettings>) => {
    if (patch.marketDataUrl !== undefined && !isAllowedMarketDataUrl(patch.marketDataUrl)) {
      throw new Error('Market data URL must use wss://, or ws:// on localhost')
    }
    if (patch.marketSource !== undefined && !['public', 'demo', 'remote'].includes(patch.marketSource)) throw new Error('Invalid market source')
    if (patch.watchlist !== undefined && (!Array.isArray(patch.watchlist) || patch.watchlist.length > 60 || patch.watchlist.some((symbol) => typeof symbol !== 'string' || symbol.length > 24))) throw new Error('Invalid watchlist')
    const allowed: Partial<AppSettings> = {}
    for (const key of ['selectedSymbol', 'watchlist', 'alwaysOnTop', 'launchAtLogin', 'marketSource', 'marketDataUrl', 'soundEnabled', 'alerts'] as const) {
      if (patch[key] !== undefined) Object.assign(allowed, { [key]: patch[key] })
    }
    const next = store.update(allowed)
    mainWindow?.setAlwaysOnTop(next.alwaysOnTop, 'pop-up-menu')
    if (patch.launchAtLogin !== undefined) applyLaunchAtLogin(next.launchAtLogin)
    if (patch.marketDataUrl !== undefined || patch.marketSource !== undefined || patch.watchlist !== undefined) {
      const options = marketOptions(next)
      options.source = next.marketSource
      market.restart(options)
    }
    emitSettings(next)
    return next
  })
  ipcMain.handle('window:toggle-panel', togglePanel)
  ipcMain.handle('window:set-click-through', (_event, enabled: boolean) => setClickThrough(Boolean(enabled)))
  ipcMain.handle('window:set-interactive-regions', (_event, regions: unknown) => {
    if (!mainWindow) return
    interactiveRegions = parseInteractiveRegions(regions, mainWindow.getBounds())
    syncPointerMode()
  })
  ipcMain.handle('window:drag-start', (_event, x: number, y: number) => {
    if (!validPoint(x, y)) throw new Error('Invalid drag coordinates')
    if (mainWindow && !store.get().clickThrough) windowDrag = { pointer: { x, y }, bounds: mainWindow.getBounds() }
  })
  ipcMain.handle('window:drag-move', (_event, x: number, y: number) => {
    if (!validPoint(x, y)) throw new Error('Invalid drag coordinates')
    if (!mainWindow || !windowDrag) return
    const requested = { x: windowDrag.bounds.x + x - windowDrag.pointer.x, y: windowDrag.bounds.y + y - windowDrag.pointer.y }
    const area = screen.getDisplayMatching({ ...windowDrag.bounds, ...requested }).workArea
    const position = clampWindowPosition(requested, windowDrag.bounds, area)
    mainWindow.setPosition(position.x, position.y)
  })
  ipcMain.handle('window:drag-end', () => { windowDrag = undefined })
  ipcMain.handle('mate-engine:status', () => mateEngineStatus())
  ipcMain.handle('mate-engine:start', () => {
    const status = startMateEngine()
    refreshTray()
    return status
  })
  ipcMain.handle('mate-engine:stop', () => {
    const status = stopMateEngine()
    refreshTray()
    return status
  })
}

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  app.setAppUserModelId('com.finpet.desktop')
  store = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  if (proxy) await session.defaultSession.setProxy({ proxyRules: proxy, proxyBypassRules: '<local>' })
  const settings = store.get()
  if (process.env.FINPET_MARKET_WS && !settings.marketDataUrl) {
    settings.marketSource = 'remote'
    store.update({ marketSource: 'remote' })
  }
  market = new MarketHub(marketOptions(settings))
  applyLaunchAtLogin(store.get().launchAtLogin)
  registerIpc()
  mainWindow = createWindow()
  updatePointerTracking()
  const trayPath = app.isPackaged ? join(process.resourcesPath, 'tray.png') : join(app.getAppPath(), 'build', 'tray.png')
  const trayImage = nativeImage.createFromPath(trayPath)
  tray = new Tray(trayImage)
  tray.setToolTip('FinPet 金融桌宠')
  tray.setContextMenu(buildTrayMenu())
  tray.on('double-click', () => void togglePanel())
  market.on('quotes', (quotes: QuoteTick[]) => {
    mainWindow?.webContents.send('market:quotes', quotes)
    processAlerts(quotes)
  })
  market.on('status', (status: ProviderStatus) => mainWindow?.webContents.send('market:status', status))
  market.start()
})

app.on('second-instance', () => {
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()
})

app.on('before-quit', () => {
  quitting = true
  stopMateEngine()
  market?.stop()
  if (pointerTimer) clearInterval(pointerTimer)
  if (moveTimer) clearTimeout(moveTimer)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
