import { marketFreshnessMs, moodIndexSymbol } from './domain'
import type { MarketProvider, ProviderStatus, QuoteTick } from './types'
import { brand } from './brand'

export interface MarketRecap {
  title: string
  date: string
  time: string
  source: string
  demo: boolean
  cached: boolean
  index: QuoteTick
  quotes: QuoteTick[]
  rising: number
  falling: number
  unchanged: number
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false })

export function buildMarketRecap(quotes: QuoteTick[], provider: MarketProvider, source: string, status: ProviderStatus, now: number): MarketRecap | null {
  const index = quotes.find((quote) => quote.symbol === moodIndexSymbol)
  if (!index || !Number.isFinite(index.timestamp) || !Number.isFinite(index.price) || !Number.isFinite(index.changePct) || index.timestamp <= 0 || index.timestamp > now + marketFreshnessMs) return null
  const date = dateFormatter.format(index.timestamp)
  const time = timeFormatter.format(index.timestamp)
  const cached = status === 'offline' || status === 'connecting' || index.status === 'offline' || (index.status === 'open' && now - index.timestamp > marketFreshnessMs)
  const closed = index.status === 'closed' && time >= '15:00'
  const available = quotes.filter((quote) => Number.isFinite(quote.timestamp) && quote.timestamp > 0 && quote.timestamp <= now + marketFreshnessMs && dateFormatter.format(quote.timestamp) === date && Math.abs(quote.timestamp - index.timestamp) <= marketFreshnessMs && Number.isFinite(quote.price) && Number.isFinite(quote.changePct))
  return {
    title: closed ? '收盘快照' : '行情快照', date, time, source, demo: provider === 'demo', cached, index,
    quotes: available, rising: available.filter((quote) => quote.changePct > 0).length,
    falling: available.filter((quote) => quote.changePct < 0).length,
    unchanged: available.filter((quote) => quote.changePct === 0).length
  }
}

export function recapText(recap: MarketRecap): string {
  return [
    `${brand.name} ${recap.demo ? '演示数据 | ' : ''}${recap.title} | ${recap.date} ${recap.time} (Asia/Shanghai)`,
    `来源：${recap.source}${recap.cached ? ' | 离线或延迟缓存' : ''}`,
    ...recap.quotes.map((quote) => `${quote.name} (${quote.symbol}) ${quote.price.toFixed(2)} ${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%`),
    '仅包含已获取的关注标的快照，不代表全市场涨跌分布。公开行情可能延迟，不构成投资建议。'
  ].join('\n')
}
