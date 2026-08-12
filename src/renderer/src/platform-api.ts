import type { AlertEvent, AppSettings, FinPetApi, ProviderStatus, QuoteTick } from '../../shared/types'

const names = [
  ['000001.SH', '上证指数', 3576.4, 3568.21],
  ['399001.SZ', '深证成指', 11128.6, 11084.35],
  ['600519.SH', '贵州茅台', 1712.8, 1701.3],
  ['AAPL', 'Apple', 230.21, 228.91]
] as const

let browserSettings: AppSettings = {
  selectedSymbol: '000001.SH',
  watchlist: names.map(([symbol]) => symbol),
  alwaysOnTop: true,
  launchAtLogin: false,
  clickThrough: false,
  soundEnabled: true,
  panelOpen: new URLSearchParams(location.search).get('mode') === 'compact' ? false : true,
  alerts: [{ id: 'preview', symbol: '600519.SH', direction: 'above', target: 1720, enabled: true }]
}

let browserQuotes: QuoteTick[] = names.map(([symbol, name, price, previousClose], index) => ({
  symbol, name, price, previousClose,
  change: Number((price - previousClose).toFixed(2)),
  changePct: Number((((price - previousClose) / previousClose) * 100).toFixed(2)),
  timestamp: Date.now(), status: 'open',
  sparkline: Array.from({ length: 42 }, (_, point) => price * (1 + Math.sin(point / 5 + index) * 0.004 + point * 0.00008))
}))

const quoteListeners = new Set<(quotes: QuoteTick[]) => void>()
const settingsListeners = new Set<(settings: AppSettings) => void>()
const statusListeners = new Set<(status: ProviderStatus) => void>()
const alertListeners = new Set<(event: AlertEvent) => void>()

const browserApi: FinPetApi = {
  getSnapshot: async () => ({ settings: browserSettings, quotes: browserQuotes, provider: 'demo', providerStatus: 'demo' }),
  updateSettings: async (patch) => {
    browserSettings = { ...browserSettings, ...patch }
    settingsListeners.forEach((listener) => listener(browserSettings))
    return browserSettings
  },
  togglePanel: async () => {
    browserSettings = { ...browserSettings, panelOpen: !browserSettings.panelOpen }
    settingsListeners.forEach((listener) => listener(browserSettings))
    return browserSettings.panelOpen
  },
  setClickThrough: async (enabled) => {
    browserSettings = { ...browserSettings, clickThrough: enabled, panelOpen: enabled ? false : browserSettings.panelOpen }
    settingsListeners.forEach((listener) => listener(browserSettings))
    return enabled
  },
  onQuotes: (listener) => { quoteListeners.add(listener); return () => quoteListeners.delete(listener) },
  onSettings: (listener) => { settingsListeners.add(listener); return () => settingsListeners.delete(listener) },
  onProviderStatus: (listener) => { statusListeners.add(listener); return () => statusListeners.delete(listener) },
  onAlert: (listener) => { alertListeners.add(listener); return () => alertListeners.delete(listener) }
}

const isElectronRenderer = navigator.userAgent.includes('Electron')
if (!window.finpet && isElectronRenderer) throw new Error('FinPet preload API is unavailable')

if (!window.finpet) {
  window.setInterval(() => {
    browserQuotes = browserQuotes.map((quote, index) => {
      const drift = Math.sin(Date.now() / 4000 + index) * 0.0008 + (Math.random() - 0.5) * 0.0005
      const price = Number((quote.price * (1 + drift)).toFixed(quote.price > 1000 ? 2 : 3))
      const change = price - quote.previousClose
      return { ...quote, price, change: Number(change.toFixed(2)), changePct: Number((change / quote.previousClose * 100).toFixed(2)), timestamp: Date.now(), sparkline: [...quote.sparkline, price].slice(-48) }
    })
    quoteListeners.forEach((listener) => listener(browserQuotes))
  }, 1_200)
}

export const platformApi = window.finpet ?? browserApi
