import { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, screen, Tray } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { alertTriggered, formatAlert, isAllowedMarketDataUrl } from '../shared/domain'
import type { AlertEvent, AppSettings, ProviderStatus, QuoteTick } from '../shared/types'
import { MarketHub } from './market-hub'
import { SettingsStore } from './settings-store'

const currentDir = dirname(fileURLToPath(import.meta.url))
const collapsedSize = { width: 360, height: 440 }
const expandedSize = { width: 960, height: 680 }
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let store: SettingsStore
let market: MarketHub
let quitting = false
let moveTimer: NodeJS.Timeout | undefined

if (process.env.FINPET_E2E_USER_DATA) app.setPath('userData', process.env.FINPET_E2E_USER_DATA)
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

function createWindow(): BrowserWindow {
  const settings = store.get()
  const area = screen.getPrimaryDisplay().workArea
  const size = settings.panelOpen ? expandedSize : collapsedSize
  const fallback = { x: area.x + area.width - size.width - 24, y: area.y + area.height - size.height - 24 }
  const position = settings.windowPosition ?? fallback
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
  window.setIgnoreMouseEvents(settings.clickThrough, { forward: true })
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
  if (panelOpen) mainWindow.setIgnoreMouseEvents(false)
  mainWindow.show()
}

function buildTrayMenu(): Menu {
  const settings = store.get()
  return Menu.buildFromTemplate([
    { label: settings.panelOpen ? '收起面板' : '打开行情面板', click: () => void togglePanel() },
    {
      label: '鼠标穿透', type: 'checkbox', checked: settings.clickThrough,
      click: (item) => void setClickThrough(item.checked)
    },
    {
      label: '总在最前', type: 'checkbox', checked: settings.alwaysOnTop,
      click: (item) => {
        const next = store.update({ alwaysOnTop: item.checked })
        mainWindow?.setAlwaysOnTop(next.alwaysOnTop)
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
  emitSettings(settings)
  return panelOpen
}

async function setClickThrough(enabled: boolean): Promise<boolean> {
  const settings = store.update({ clickThrough: enabled, panelOpen: enabled ? false : store.get().panelOpen })
  updateWindowMode(settings.panelOpen)
  mainWindow?.setIgnoreMouseEvents(enabled, { forward: true })
  emitSettings(settings)
  return enabled
}

function processAlerts(quotes: QuoteTick[]): void {
  const settings = store.get()
  let changed = false
  for (const alert of settings.alerts) {
    const quote = quotes.find((item) => item.symbol === alert.symbol)
    if (!quote || !alertTriggered(alert, quote)) continue
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

function registerIpc(): void {
  ipcMain.handle('app:snapshot', () => ({
    settings: store.get(),
    quotes: market.getQuotes(),
    provider: market.getProvider(),
    providerStatus: market.getStatus()
  }))
  ipcMain.handle('settings:update', (_event, patch: Partial<AppSettings>) => {
    if (patch.marketDataUrl !== undefined && !isAllowedMarketDataUrl(patch.marketDataUrl)) {
      throw new Error('Market data URL must use wss://, or ws:// on localhost')
    }
    const allowed: Partial<AppSettings> = {}
    for (const key of ['selectedSymbol', 'watchlist', 'alwaysOnTop', 'launchAtLogin', 'marketDataUrl', 'soundEnabled', 'alerts'] as const) {
      if (patch[key] !== undefined) Object.assign(allowed, { [key]: patch[key] })
    }
    const next = store.update(allowed)
    mainWindow?.setAlwaysOnTop(next.alwaysOnTop)
    if (patch.launchAtLogin !== undefined) applyLaunchAtLogin(next.launchAtLogin)
    if (patch.marketDataUrl !== undefined) market.restart(next.marketDataUrl)
    emitSettings(next)
    return next
  })
  ipcMain.handle('window:toggle-panel', togglePanel)
  ipcMain.handle('window:set-click-through', (_event, enabled: boolean) => setClickThrough(Boolean(enabled)))
}

if (hasSingleInstanceLock) app.whenReady().then(() => {
  app.setAppUserModelId('com.finpet.desktop')
  store = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
  market = new MarketHub(store.get().marketDataUrl || process.env.FINPET_MARKET_WS)
  applyLaunchAtLogin(store.get().launchAtLogin)
  registerIpc()
  mainWindow = createWindow()
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
  market?.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
