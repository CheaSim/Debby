import { moodIndexSymbol } from './domain'
import type { ProviderStatus, QuoteTick } from './types'

export const showcaseScenes = ['bullish', 'bearish', 'alert', 'offline', 'close'] as const
export type ShowcaseScene = typeof showcaseScenes[number]
export const showcaseLabels: Record<ShowcaseScene, string> = {
  bullish: '上涨', bearish: '下跌', alert: '提醒', offline: '断线', close: '收盘'
}
export const showcaseSceneSeconds = 12

export function showcaseSnapshot(scene: ShowcaseScene, now: number): {
  quotes: QuoteTick[]; providerStatus: ProviderStatus; alerting: boolean
} {
  const pct = scene === 'bearish' ? -1.28 : scene === 'offline' ? 0.02 : 0.84
  // Synthetic timestamps are confined to the explicitly labelled showcase.
  const shanghaiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const closingTime = Date.parse(`${shanghaiDate}T15:00:00+08:00`)
  const timestamp = scene === 'close' ? closingTime > now ? closingTime - 86_400_000 : closingTime : now
  const instruments = [
    [moodIndexSymbol, '上证指数', 3200, pct],
    ['399001.SZ', '深证成指', 10200, pct * 1.2],
    ['399006.SZ', '创业板指', 2200, pct * 1.5],
    ['600519.SH', '贵州茅台', 1500, -pct * 0.6]
  ] as const
  return {
    quotes: instruments.map(([symbol, name, previousClose, changePct]) => {
      const price = Number((previousClose * (1 + changePct / 100)).toFixed(2))
      return {
        symbol, name, previousClose, price, change: Number((price - previousClose).toFixed(2)), changePct,
        timestamp, status: scene === 'offline' ? 'offline' : scene === 'close' ? 'closed' : 'open',
        sparkline: Array.from({ length: 32 }, (_, index) => previousClose + (price - previousClose) * index / 31)
      }
    }),
    providerStatus: scene === 'offline' ? 'offline' : 'demo', alerting: scene === 'alert'
  }
}
