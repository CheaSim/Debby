import type { MarketStatus, QuoteTick } from '../shared/types'
import { marketFreshnessMs } from '../shared/domain'

export type QuoteRequest = (url: string, init: RequestInit) => Promise<Response>
export type PublicQuoteSource = 'tencent' | 'sina'
export const publicSourceNames = { tencent: '腾讯行情', sina: '新浪行情 · 备用' }

export function toPublicSymbol(symbol: string): string | null {
  const match = /^(\d{6})\.(SH|SZ)$/.exec(symbol)
  return match ? `${match[2].toLowerCase()}${match[1]}` : null
}

function fromPublicSymbol(symbol: string): string {
  return `${symbol.slice(2)}.${symbol.slice(0, 2).toUpperCase()}`
}

export function parseChinaTimestamp(value: string): number | null {
  const digits = value.replace(/[- :]/g, '')
  if (!/^\d{14}$/.test(digits)) return null
  const [year, month, day, hour, minute, second] = [
    digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8),
    digits.slice(8, 10), digits.slice(10, 12), digits.slice(12, 14)
  ].map(Number)
  const utc = Date.UTC(year, month - 1, day, hour, minute, second)
  const roundTrip = new Date(utc).toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
  return roundTrip === digits ? utc - 8 * 60 * 60_000 : null
}

export function publicMarketStatus(timestamp: number, now: number): MarketStatus {
  const date = new Date(now + 8 * 60 * 60_000)
  const quoteDate = new Date(timestamp + 8 * 60 * 60_000)
  const minute = date.getUTCHours() * 60 + date.getUTCMinutes()
  const tradingHours = date.getUTCDay() !== 0 && date.getUTCDay() !== 6 &&
    ((minute >= 570 && minute < 690) || (minute >= 780 && minute < 900))
  // A previous trading date remains a closing quote, including exchange holidays.
  if (!tradingHours || date.toISOString().slice(0, 10) !== quoteDate.toISOString().slice(0, 10)) return 'closed'
  return now - timestamp > marketFreshnessMs || timestamp > now + marketFreshnessMs ? 'offline' : 'open'
}

function number(value: string | undefined): number {
  return value?.trim() ? Number(value) : NaN
}

function makeQuote(symbol: string, name: string, price: number, previousClose: number, timestamp: number | null,
  previous: ReadonlyMap<string, QuoteTick>, now: number, reportedPct?: number): QuoteTick | null {
  if (!name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(previousClose) || previousClose <= 0 || timestamp === null) return null
  const prior = previous.get(symbol)
  const sameDay = prior && new Date(prior.timestamp + 8 * 60 * 60_000).toISOString().slice(0, 10) ===
    new Date(timestamp + 8 * 60 * 60_000).toISOString().slice(0, 10)
  const points = sameDay ? prior.sparkline : []
  const sparkline = prior?.timestamp === timestamp && points.length ? points : [...points, price].slice(-120)
  const change = price - previousClose
  return { symbol, name, price, previousClose, change: Number(change.toFixed(4)),
    changePct: Number.isFinite(reportedPct) ? reportedPct! : Number((change / previousClose * 100).toFixed(2)),
    timestamp, status: publicMarketStatus(timestamp, now), sparkline }
}

export function parsePublicQuotes(source: PublicQuoteSource, text: string, previous: ReadonlyMap<string, QuoteTick> = new Map(), now = Date.now()): QuoteTick[] {
  const result: QuoteTick[] = []
  const pattern = source === 'tencent' ? /v_((?:sh|sz)\d{6})="([^"]*)";/g : /var hq_str_((?:sh|sz)\d{6})="([^"]*)";/g
  for (const match of text.matchAll(pattern)) {
    const fields = match[2].split(source === 'tencent' ? '~' : ',')
    const symbol = fromPublicSymbol(match[1])
    const quote = source === 'tencent'
      ? makeQuote(symbol, fields[1], number(fields[3]), number(fields[4]), parseChinaTimestamp(fields[30] ?? ''), previous, now, number(fields[32]))
      : makeQuote(symbol, fields[0], number(fields[3]), number(fields[2]), parseChinaTimestamp(`${fields[30] ?? ''} ${fields[31] ?? ''}`), previous, now)
    if (quote) result.push(quote)
  }
  return result
}

export async function fetchPublicQuotes(symbols: string[], previous: ReadonlyMap<string, QuoteTick>, request: QuoteRequest = fetch,
  signal?: AbortSignal): Promise<{ source: PublicQuoteSource; quotes: QuoteTick[] }> {
  const codes = [...new Set(symbols.map(toPublicSymbol).filter((symbol): symbol is string => Boolean(symbol)))].slice(0, 60)
  if (!codes.length) throw new Error('No supported A-share symbols')
  for (const source of ['tencent', 'sina'] as const) {
    if (signal?.aborted) throw new Error('Quote request cancelled')
    const url = source === 'tencent' ? `https://qt.gtimg.cn/q=${codes.join(',')}` : `https://hq.sinajs.cn/list=${codes.join(',')}`
    try {
      const response = await request(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000),
        headers: { Referer: 'https://finance.sina.com.cn/' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = new TextDecoder('gb18030').decode(await response.arrayBuffer())
      const allowed = new Set(codes.map(fromPublicSymbol))
      const quotes = parsePublicQuotes(source, text, previous).filter((quote) => allowed.has(quote.symbol))
      if (!quotes.some((quote) => quote.symbol === '000001.SH')) throw new Error('Benchmark quote missing')
      return { source, quotes }
    } catch {
      if (signal?.aborted) throw new Error('Quote request cancelled')
    }
  }
  throw new Error('Public quote sources unavailable')
}
