import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, net, Notification, powerMonitor, safeStorage, screen, session, shell, Tray } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { alertTriggered, formatAlert, isAllowedMarketDataUrl, marketFreshnessMs } from '../shared/domain'
import type { AlertEvent, AppSettings, ProviderStatus, QuoteTick } from '../shared/types'
import { MarketHub, type MarketHubOptions } from './market-hub'
import { mateEngineStatus, startMateEngine, stopMateEngine } from './mate-engine'
import { SettingsStore } from './settings-store'
import { clampWindowPosition, containsPoint, parseInteractiveRegions, validPoint, type InteractiveRegion } from './window-interaction'
import { brand } from '../shared/brand'
import { ChatKeyStore } from './agent/key-store'
import { OpenRouterGateway } from './agent/openrouter'
import { marketToolsPlugin, registerTools } from './agent/plugins'
import { DebbyAgentRuntime } from './agent/runtime'
import { CompanionRuntime, loadLocalEnvironment, QwenGateway, VoiceConfigStore } from './companion'
import { ShellRuntime } from './bridge/runtime'
import { ShellServer } from './bridge/server'
import { ReadAloudRuntime } from './companion/read-aloud'
import { DanceLibrary } from './dance-library'
import { createDanceToolsPlugin } from './agent/dance-plugin'
import { createCompanionToolsPlugin } from './agent/companion-plugin'
import type { CursorPosition } from '../shared/avatar-gaze'

const currentDir = dirname(fileURLToPath(import.meta.url))
const collapsedSize = { width: 380, height: 540 }
const expandedSize = { width: 880, height: 620 }
const backgroundTest = Boolean(process.env.FINPET_E2E_USER_DATA && process.env.FINPET_E2E_BACKGROUND === '1')
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let store: SettingsStore
let market: MarketHub
let chat: DebbyAgentRuntime
let companion: CompanionRuntime
let agentShell: ShellServer
let readAloud: ReadAloudRuntime
let dances: DanceLibrary
let quitting = false
let moveTimer: NodeJS.Timeout | undefined
let pointerTimer: NodeJS.Timeout | undefined
let lastCursor = ''
let lastCursorAt = 0
let interactiveRegions: InteractiveRegion[] = []
let ignoringMouse = false
let windowDrag: { pointer: { x: number; y: number }; bounds: Electron.Rectangle } | undefined

function stopReadAloud(): void {
  readAloud?.cancel()
  if (mainWindow && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send('voice:read-aloud-stop')
}
function stopDancing(): void {
  dances?.command({ action: 'stop' })
  if (mainWindow && !mainWindow.webContents.isDestroyed()) mainWindow.webContents.send('dance:stop-capture')
}

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
    alwaysOnTop: backgroundTest ? false : settings.alwaysOnTop,
    focusable: !backgroundTest,
    hasShadow: false,
    icon: iconPath,
    webPreferences: {
      backgroundThrottling: !process.env.FINPET_E2E_USER_DATA,
      offscreen: backgroundTest,
      preload: join(currentDir, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.setMenu(null)
  // Electron 43's Windows taskbar placement can drop the default floating level.
  window.setAlwaysOnTop(backgroundTest ? false : settings.alwaysOnTop, 'pop-up-menu')
  window.webContents.setAudioMuted(backgroundTest)
  if (backgroundTest) window.webContents.setFrameRate(30)
  ignoringMouse = settings.clickThrough && !settings.panelOpen
  window.setIgnoreMouseEvents(ignoringMouse)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('render-process-gone', () => { companion?.stop(); stopReadAloud(); stopDancing() })
  window.on('hide', () => { companion?.stop(); stopReadAloud(); stopDancing() })
  window.on('minimize', () => { companion?.stop(); stopReadAloud(); stopDancing() })
  window.on('show', updatePointerTracking)
  window.on('hide', updatePointerTracking)
  window.on('minimize', updatePointerTracking)
  window.on('restore', updatePointerTracking)
  window.webContents.on('did-finish-load', () => { lastCursor = ''; syncPointerMode() })
  window.once('ready-to-show', () => {
    if (!backgroundTest && !process.argv.includes('--hidden')) window.showInactive()
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
  if (!panelOpen) { companion?.stop(); stopReadAloud() }
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
  if (!backgroundTest) mainWindow.show()
}

function syncPointerMode(): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  const settings = store.get()
  const bounds = mainWindow.getBounds()
  const cursor = screen.getCursorScreenPoint()
  const local = { x: cursor.x - bounds.x, y: cursor.y - bounds.y }
  const zoom = mainWindow.webContents.getZoomFactor()
  const position: CursorPosition = { x: local.x / zoom, y: local.y / zoom, source: 'desktop' }
  const signature = `${position.x}:${position.y}`
  const now = Date.now()
  if (signature !== lastCursor && now - lastCursorAt >= 32 && !mainWindow.webContents.isLoadingMainFrame()) {
    lastCursor = signature
    lastCursorAt = now
    mainWindow.webContents.send('window:cursor-position', position)
  }
  const overTools = interactiveRegions.some((region) => containsPoint(region, position))
  const ignore = settings.clickThrough && !settings.panelOpen && !overTools
  if (ignore !== ignoringMouse) {
    ignoringMouse = ignore
    mainWindow.setIgnoreMouseEvents(ignore)
  }
}

function updatePointerTracking(): void {
  if (pointerTimer) clearInterval(pointerTimer)
  pointerTimer = undefined
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  syncPointerMode()
  // Read-only desktop coordinates still arrive when the cursor leaves Chromium or clicks pass through.
  if (mainWindow?.isVisible() && !mainWindow.isMinimized()) pointerTimer = setInterval(syncPointerMode, store.get().clickThrough ? 16 : 33)
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
    { label: `退出 ${brand.name}`, click: () => { quitting = true; app.quit() } }
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
    if (Notification.isSupported()) new Notification({ title: `${brand.name} 价格提醒`, body: event.message, silent: !settings.soundEnabled }).show()
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
  const handleChat = (channel: string, handler: (...args: any[]) => unknown): void => {
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Untrusted chat IPC sender')
      return handler(...args)
    })
  }
  handleChat('chat:state', () => chat.getState())
  handleChat('dance:state', () => dances.snapshot())
  handleChat('dance:asset', (id) => dances.asset(id))
  handleChat('dance:save', (input) => dances.save(input))
  handleChat('dance:remove', (id) => dances.remove(id))
  handleChat('dance:control', (command) => dances.command(command))
  handleChat('shell:state', () => agentShell.runtime.snapshot())
  handleChat('shell:enable', async (enabled) => {
    if (typeof enabled !== 'boolean') throw new Error('Invalid enabled value')
    await agentShell.enable(enabled)
    return agentShell.runtime.snapshot()
  })
  handleChat('shell:cancel', () => agentShell.runtime.cancel())
  handleChat('shell:release', () => agentShell.release())
  handleChat('shell:preview', (advance) => {
    if (advance !== undefined && typeof advance !== 'boolean') throw new Error('Invalid preview value')
    agentShell.preview(Boolean(advance))
  })
  handleChat('shell:copy-config', (format = 'json') => {
    if (app.isPackaged) throw new Error('当前 MCP 接入请使用源码运行版。')
    if (format !== 'json' && format !== 'codex') throw new Error('Invalid MCP config format')
    const args = [join(app.getAppPath(), 'scripts', 'debby-mcp.mjs'), '--connection', agentShell.connectionPath, '--name', format === 'codex' ? 'Codex' : 'MCP Agent']
    clipboard.writeText(format === 'codex'
      ? `[mcp_servers.debby]\ncommand = "node"\nargs = ${JSON.stringify(args)}\n`
      : JSON.stringify({ mcpServers: { debby: { command: 'node', args } } }, null, 2))
  })
  handleChat('chat:configure', (input) => chat.configure(input))
  handleChat('chat:models', () => chat.listModels())
  handleChat('chat:check', () => chat.checkConnection())
  handleChat('chat:key-page', () => shell.openExternal('https://openrouter.ai/settings/keys'))
  handleChat('chat:send', (text) => chat.send(text))
  handleChat('chat:cancel', () => chat.cancel())
  handleChat('chat:clear', () => chat.clear())
  handleChat('voice:state', () => companion.getState())
  handleChat('voice:read-aloud', (input) => {
    if (!store.get().panelOpen || !mainWindow?.isVisible()) throw new Error('请先打开对话面板。')
    return readAloud.read(input)
  })
  handleChat('voice:cancel-read-aloud', () => readAloud.cancel())
  handleChat('voice:stream-read-aloud', (input) => {
    if (!store.get().panelOpen || !mainWindow?.isVisible()) throw new Error('请先打开对话面板。')
    readAloud.stream(input, (event) => mainWindow?.webContents.send('voice:read-aloud-audio', event))
  })
  handleChat('voice:configure', (input) => { stopReadAloud(); return companion.configure(input) })
  handleChat('voice:start', (input) => {
    stopReadAloud()
    if (!store.get().panelOpen || !mainWindow?.isVisible()) throw new Error('请先打开对话面板。')
    return companion.start(input)
  })
  handleChat('voice:stop', () => companion.stop())
  handleChat('voice:authorize-media', (kind) => companion.authorizeMedia(kind))
  handleChat('voice:release-media', (kind) => companion.releaseMedia(kind))
  handleChat('voice:turn', (turn) => companion.submit(turn))
  handleChat('voice:interrupt', () => companion.interrupt())
  handleChat('voice:clear', () => companion.clear())
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
  ipcMain.handle('window:cursor', (): CursorPosition | null => {
    if (!mainWindow || mainWindow.isDestroyed()) return null
    const cursor = screen.getCursorScreenPoint(), bounds = mainWindow.getBounds(), zoom = mainWindow.webContents.getZoomFactor()
    return { x: (cursor.x - bounds.x) / zoom, y: (cursor.y - bounds.y) / zoom, source: 'desktop' }
  })
  ipcMain.handle('window:set-click-through', (_event, enabled: boolean) => setClickThrough(Boolean(enabled)))
  ipcMain.handle('window:set-interactive-regions', (_event, regions: unknown) => {
    if (!mainWindow) return
    const bounds = mainWindow.getBounds(), zoom = mainWindow.webContents.getZoomFactor()
    interactiveRegions = parseInteractiveRegions(regions, { width: bounds.width / zoom, height: bounds.height / zoom })
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
  // Only the development main process reads local secrets; neither Vite nor the package receives them.
  if (!app.isPackaged && !process.env.FINPET_E2E_USER_DATA) loadLocalEnvironment(join(app.getAppPath(), '.env'), process.env)
  store = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
  dances = new DanceLibrary(join(app.getPath('userData'), 'dances'), (state) => mainWindow?.webContents.send('dance:changed', state))
  agentShell = new ShellServer(new ShellRuntime((state) => mainWindow?.webContents.send('shell:changed', state), Date.now, dances), join(app.getPath('userData'), 'agent-bridge.json'))
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  if (proxy) await session.defaultSession.setProxy({ proxyRules: proxy, proxyBypassRules: '<local>' })
  const settings = store.get()
  if (process.env.FINPET_MARKET_WS && !settings.marketDataUrl) {
    settings.marketSource = 'remote'
    store.update({ marketSource: 'remote' })
  }
  market = new MarketHub(marketOptions(settings))
  const request: typeof fetch = (url, init) => net.fetch(url instanceof URL ? url.toString() : url, { ...init, redirect: 'error' })
  let avatarCueId = 0
  const companionTools = createCompanionToolsPlugin({ performAction: name => {
    if (agentShell.runtime.snapshot().controller || dances.snapshot().playback) throw Error('角色正由外部 Agent 或舞蹈控制，请先结束当前动作。')
    mainWindow?.webContents.send('avatar:action', { id: ++avatarCueId, name })
  } })
  chat = new DebbyAgentRuntime({
    credentials: new ChatKeyStore(join(app.getPath('userData'), 'agent-credentials.json'), {
      available: () => safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
      encrypt: (text) => safeStorage.encryptString(text), decrypt: (value) => safeStorage.decryptString(value)
    }),
    transport: new OpenRouterGateway(request),
    tools: registerTools([marketToolsPlugin, createDanceToolsPlugin(dances), companionTools], {
      getMarket: () => ({ quotes: market.getQuotes(), provider: market.getProvider(), providerName: market.getProviderName(), providerStatus: market.getStatus() }),
      requestQuotes: (url, init) => net.fetch(url, init)
    }),
    onState: (state) => mainWindow?.webContents.send('chat:changed', state)
  })
  const voiceCredentials = new VoiceConfigStore(join(app.getPath('userData'), 'companion-credentials.json'), {
    available: () => safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
    encrypt: (text) => safeStorage.encryptString(text), decrypt: (value) => safeStorage.decryptString(value)
  }, process.env)
  readAloud = new ReadAloudRuntime(voiceCredentials.publicConfig, (config) => new QwenGateway(request, config, voiceCredentials.getKey))
  companion = new CompanionRuntime({ credentials: voiceCredentials,
    createProvider: (config) => new QwenGateway(request, config, voiceCredentials.getKey),
    tools: registerTools([marketToolsPlugin, createDanceToolsPlugin(dances), companionTools], {
      getMarket: () => ({ quotes: market.getQuotes(), provider: market.getProvider(), providerName: market.getProviderName(), providerStatus: market.getStatus() }),
      requestQuotes: (url, init) => net.fetch(url, init)
    }),
    onState: (state) => mainWindow?.webContents.send('voice:changed', state),
    onAudio: (audio) => mainWindow?.webContents.send('voice:audio', audio)
  })
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    const allowed = permission === 'media' && contents === mainWindow?.webContents && details.isMainFrame &&
      details.requestingUrl === contents?.getURL() && companion.checksMedia(details.mediaType)
    return allowed
  })
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const media = details as Electron.MediaAccessPermissionRequest
    const allowed = permission === 'media' && contents === mainWindow?.webContents && details.isMainFrame &&
      details.requestingUrl === contents.getURL() && companion.permitsMedia(media.mediaTypes ?? [], true)
    callback(allowed)
  })
  powerMonitor.on('suspend', () => { companion.stop(); stopReadAloud(); agentShell.release(); stopDancing() })
  powerMonitor.on('lock-screen', () => { companion.stop(); stopReadAloud(); agentShell.release(); stopDancing() })
  applyLaunchAtLogin(store.get().launchAtLogin)
  registerIpc()
  mainWindow = createWindow()
  updatePointerTracking()
  const trayPath = app.isPackaged ? join(process.resourcesPath, 'tray.png') : join(app.getAppPath(), 'build', 'tray.png')
  const trayImage = nativeImage.createFromPath(trayPath)
  tray = new Tray(trayImage)
  tray.setToolTip(`${brand.name} 金融桌宠`)
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
  chat?.cancel()
  companion?.stop()
  readAloud?.cancel()
  agentShell?.dispose()
  dances?.dispose()
  if (pointerTimer) clearInterval(pointerTimer)
  if (moveTimer) clearTimeout(moveTimer)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
