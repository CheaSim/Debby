import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type } from 'typebox'
import type { MarketProvider, ProviderStatus, QuoteTick } from '../../shared/types'
import { fetchPublicQuotes, publicSourceNames, toPublicSymbol, type QuoteRequest } from '../public-market'

export interface AgentMarketSnapshot {
  quotes: QuoteTick[]
  provider: MarketProvider
  providerName: string
  providerStatus: ProviderStatus
}
export interface DebbyToolContext {
  getMarket: () => AgentMarketSnapshot
  requestQuotes: QuoteRequest
}
/** Plugins are trusted application code registered explicitly, not downloaded or model-generated. */
export interface DebbyToolPlugin { id: string; createTools: (context: DebbyToolContext) => AgentTool[] }

export function registerTools(plugins: readonly DebbyToolPlugin[], context: DebbyToolContext): AgentTool[] {
  const names = new Set<string>()
  const ids = new Set<string>()
  return plugins.flatMap((plugin) => {
    if (ids.has(plugin.id)) throw new Error(`Duplicate plugin: ${plugin.id}`)
    ids.add(plugin.id)
    return plugin.createTools(context).map((tool) => {
      if (names.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`)
      names.add(tool.name)
      return tool
    })
  })
}

const result = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }], details: {} })
const compactQuote = ({ sparkline: _sparkline, ...quote }: QuoteTick) => ({ ...quote, time: new Date(quote.timestamp).toISOString() })
export const marketToolsPlugin: DebbyToolPlugin = {
  id: 'debby.market',
  createTools: ({ getMarket, requestQuotes }) => [
    { name: 'get_market_snapshot', label: '查看指数与自选', description: '读取当前指数和自选行情，含真实来源、时间和休市/离线/演示状态；不是保证实时数据。',
      parameters: Type.Object({}), execute: async () => {
        const market = getMarket()
        return result({ ...market, quotes: market.quotes.map(compactQuote), fetchedAt: new Date().toISOString(), warning: '公开行情可能延迟。演示和离线数据不得当作实时行情。' })
      } },
    { name: 'get_quote', label: '查询 A 股行情', description: '查询一只沪深证券，symbol 格式为 600519.SH 或 399001.SZ；不支持美股、下单。',
      parameters: Type.Object({ symbol: Type.String({ pattern: '^\\d{6}\\.(SH|SZ)$', maxLength: 9 }) }),
      execute: async (_id, params, signal) => {
        const { symbol } = params as { symbol: string }
        if (!toPublicSymbol(symbol)) throw new Error('不支持的证券代码。')
        const { source, quotes } = await fetchPublicQuotes(['000001.SH', symbol], new Map(), requestQuotes, signal)
        const quote = quotes.find((item) => item.symbol === symbol)
        if (!quote) throw new Error('没有查到该证券，不得编造价格。')
        return result({ source: publicSourceNames[source], quote: compactQuote(quote), warning: '公开行情可能延迟，不构成投资建议。' })
      } },
    { name: 'get_market_sources', label: '查看数据来源', description: '读取当前行情源状态及开源数据项目链接，不执行网页内容。', parameters: Type.Object({}),
      execute: async () => {
        const { provider, providerName, providerStatus } = getMarket()
        return result({ provider, providerName, providerStatus, sources: ['腾讯公开行情', '新浪公开行情（备用）'],
          projects: ['https://github.com/akfamily/akshare', 'https://github.com/shidenggui/easyquotation'], note: '开源项目链接仅供了解；当前数据由 Debby 的腾讯/新浪适配器获取。' })
      } }
  ]
}
