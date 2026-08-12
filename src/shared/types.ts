export type MarketStatus = 'open' | 'closed' | 'offline'
export type PetMood = 'idle' | 'bullish' | 'bearish' | 'alert' | 'offline'
export type ProviderStatus = 'demo' | 'connecting' | 'live' | 'offline'

export interface QuoteTick {
  symbol: string
  name: string
  price: number
  previousClose: number
  change: number
  changePct: number
  timestamp: number
  status: MarketStatus
  sparkline: number[]
}

export interface PriceAlert {
  id: string
  symbol: string
  direction: 'above' | 'below'
  target: number
  enabled: boolean
  lastTriggeredAt?: number
}

export interface AppSettings {
  selectedSymbol: string
  watchlist: string[]
  alwaysOnTop: boolean
  launchAtLogin: boolean
  marketDataUrl?: string
  clickThrough: boolean
  soundEnabled: boolean
  panelOpen: boolean
  alerts: PriceAlert[]
  windowPosition?: { x: number; y: number }
}

export interface AppSnapshot {
  settings: AppSettings
  quotes: QuoteTick[]
  provider: 'demo' | 'remote'
  providerStatus: ProviderStatus
}

export interface AlertEvent {
  alert: PriceAlert
  quote: QuoteTick
  message: string
}

export interface FinPetApi {
  getSnapshot: () => Promise<AppSnapshot>
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  togglePanel: () => Promise<boolean>
  setClickThrough: (enabled: boolean) => Promise<boolean>
  onQuotes: (listener: (quotes: QuoteTick[]) => void) => () => void
  onSettings: (listener: (settings: AppSettings) => void) => () => void
  onProviderStatus: (listener: (status: ProviderStatus) => void) => () => void
  onAlert: (listener: (event: AlertEvent) => void) => () => void
}
