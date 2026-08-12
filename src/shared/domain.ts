import type { MarketStatus, PetMood, PriceAlert, QuoteTick } from './types'

export function normalizeQuoteTick(value: unknown, previous?: QuoteTick, now = Date.now()): QuoteTick | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  if (typeof input.symbol !== 'string' || input.symbol.length === 0) return null
  if (typeof input.price !== 'number' || !Number.isFinite(input.price) || input.price <= 0) return null

  const previousClose = typeof input.previousClose === 'number' && Number.isFinite(input.previousClose) && input.previousClose > 0
    ? input.previousClose
    : previous?.previousClose ?? input.price
  const change = input.price - previousClose
  const status: MarketStatus = input.status === 'closed' || input.status === 'offline' ? input.status : 'open'
  const remoteSparkline = Array.isArray(input.sparkline)
    ? input.sparkline.filter((point): point is number => typeof point === 'number' && Number.isFinite(point))
    : []
  const sparkline = remoteSparkline.length > 0
    ? remoteSparkline.slice(-120)
    : [...(previous?.sparkline ?? [previousClose]), input.price].slice(-120)

  return {
    symbol: input.symbol,
    name: typeof input.name === 'string' && input.name.length > 0 ? input.name : previous?.name ?? input.symbol,
    price: input.price,
    previousClose,
    change: typeof input.change === 'number' && Number.isFinite(input.change) ? input.change : Number(change.toFixed(4)),
    changePct: typeof input.changePct === 'number' && Number.isFinite(input.changePct)
      ? input.changePct
      : Number(((change / previousClose) * 100).toFixed(4)),
    timestamp: typeof input.timestamp === 'number' && Number.isFinite(input.timestamp) ? input.timestamp : now,
    status,
    sparkline
  }
}

export function isAllowedMarketDataUrl(value: string): boolean {
  if (value.trim() === '') return true
  try {
    const url = new URL(value)
    if (url.protocol === 'wss:') return true
    return url.protocol === 'ws:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

export function moodForQuote(quote: QuoteTick | undefined, alerting = false): PetMood {
  if (alerting) return 'alert'
  if (!quote || quote.status === 'offline' || Date.now() - quote.timestamp > 15_000) return 'offline'
  if (quote.changePct >= 1) return 'bullish'
  if (quote.changePct <= -1) return 'bearish'
  return 'idle'
}

export function alertTriggered(alert: PriceAlert, quote: QuoteTick, now = Date.now()): boolean {
  if (!alert.enabled || alert.symbol !== quote.symbol) return false
  if (alert.lastTriggeredAt && now - alert.lastTriggeredAt < 5 * 60_000) return false
  return alert.direction === 'above' ? quote.price >= alert.target : quote.price <= alert.target
}

export function formatAlert(alert: PriceAlert, quote: QuoteTick): string {
  const verb = alert.direction === 'above' ? '突破' : '跌破'
  return `${quote.name} ${verb} ${alert.target.toFixed(2)}，现价 ${quote.price.toFixed(2)}`
}
