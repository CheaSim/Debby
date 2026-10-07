import { describe, expect, it, vi } from 'vitest'
import { fetchPublicQuotes, parseChinaTimestamp, parsePublicQuotes, publicMarketStatus, toPublicSymbol } from '../src/main/public-market'
import { sinaRecord, tencentRecord } from './fixtures/market'

describe('public A-share adapters', () => {
  it('maps exchange-qualified codes without confusing the two 000001 symbols', () => {
    expect(toPublicSymbol('000001.SH')).toBe('sh000001')
    expect(toPublicSymbol('000001.SZ')).toBe('sz000001')
    expect(toPublicSymbol('AAPL')).toBeNull()
    expect(toPublicSymbol('000001.SH&list=evil')).toBeNull()
  })

  it('parses Shanghai timestamps in UTC+8 and rejects invalid dates', () => {
    expect(parseChinaTimestamp('20260930161500')).toBe(Date.parse('2026-09-30T16:15:00+08:00'))
    expect(parseChinaTimestamp('2026-09-30 16:15:00')).toBe(Date.parse('2026-09-30T16:15:00+08:00'))
    for (const value of ['', 'invalid', '20260230090000', '20260930251500']) expect(parseChinaTimestamp(value)).toBeNull()
  })

  it('distinguishes active trading, lunch, weekend, holidays and stale intraday quotes', () => {
    const at = (value: string) => Date.parse(`${value}+08:00`)
    const timestamp = at('2026-09-30T10:00:00')
    expect(publicMarketStatus(timestamp, timestamp + 5_000)).toBe('open')
    expect(publicMarketStatus(timestamp, timestamp + 90_000)).toBe('offline')
    expect(publicMarketStatus(timestamp, at('2026-09-30T12:00:00'))).toBe('closed')
    expect(publicMarketStatus(timestamp, at('2026-09-30T15:00:00'))).toBe('closed')
    expect(publicMarketStatus(timestamp, at('2026-10-03T10:00:00'))).toBe('closed')
    expect(publicMarketStatus(timestamp, at('2026-10-07T10:00:00'))).toBe('closed')
  })

  it('normalizes Tencent and Sina snapshots and never fabricates timestamps or prices', () => {
    const now = Date.parse('2026-10-07T10:00:00+08:00')
    const [tencent] = parsePublicQuotes('tencent', tencentRecord({ name: '上证指数' }), new Map(), now)
    const [sina] = parsePublicQuotes('sina', sinaRecord({ name: '上证指数' }), new Map(), now)
    expect(tencent).toMatchObject({ symbol: '000001.SH', name: '上证指数', price: 3842.19, changePct: 0.31, status: 'closed' })
    expect(sina).toMatchObject({ symbol: '000001.SH', name: '上证指数', price: 3842.1946, changePct: 0.31, status: 'closed' })
    for (const record of [tencentRecord({ price: '' }), tencentRecord({ price: 'NaN' }), tencentRecord({ price: '-1' }),
      tencentRecord({ previousClose: '0' }), tencentRecord({ timestamp: '' }), 'window.alert(1)']) {
      expect(parsePublicQuotes('tencent', record)).toEqual([])
    }
  })

  it('keeps only observed prices, deduplicates closed snapshots and resets on a new trading date', () => {
    const [first] = parsePublicQuotes('tencent', tencentRecord())
    const previous = new Map([[first.symbol, first]])
    expect(parsePublicQuotes('tencent', tencentRecord(), previous)[0].sparkline).toEqual([3842.19])
    expect(parsePublicQuotes('tencent', tencentRecord({ timestamp: '20260930161510', price: '3843' }), previous)[0].sparkline).toEqual([3842.19, 3843])
    expect(parsePublicQuotes('tencent', tencentRecord({ timestamp: '20261008093000', price: '3850' }), previous)[0].sparkline).toEqual([3850])
  })

  it('batches only requested symbols, decodes GBK, and falls back after a primary failure', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('primary offline')).mockResolvedValueOnce(new Response(sinaRecord()))
    const result = await fetchPublicQuotes(['000001.SH', '000001.SH', '600519.SH', 'AAPL'], new Map(), request)
    expect(result.source).toBe('sina')
    expect(result.quotes[0].symbol).toBe('000001.SH')
    expect(request.mock.calls[0][0]).toBe('https://qt.gtimg.cn/q=sh000001,sh600519')
    expect(request.mock.calls[1][1].headers.Referer).toBe('https://finance.sina.com.cn/')
    const bytes = Uint8Array.from([0xc9, 0xcf, 0xd6, 0xa4, 0xd6, 0xb8, 0xca, 0xfd])
    const prefix = new TextEncoder().encode(tencentRecord({ name: '' }).split('~~')[0] + '~')
    const suffix = new TextEncoder().encode(tencentRecord({ name: '' }).split('~~')[1])
    const payload = new Uint8Array([...prefix, ...bytes, 126, ...suffix])
    const decoded = await fetchPublicQuotes(['000001.SH'], new Map(), async () => new Response(payload))
    expect(decoded.quotes[0].name).toBe('上证指数')
  })

  it('rejects missing benchmarks and respects cancellation without probing another provider', async () => {
    const missing = vi.fn(async () => new Response(tencentRecord({ code: 'sz399001' })))
    await expect(fetchPublicQuotes(['000001.SH'], new Map(), missing)).rejects.toThrow('unavailable')
    expect(missing).toHaveBeenCalledTimes(2)
    const controller = new AbortController()
    controller.abort()
    const cancelled = vi.fn()
    await expect(fetchPublicQuotes(['000001.SH'], new Map(), cancelled, controller.signal)).rejects.toThrow('cancelled')
    expect(cancelled).not.toHaveBeenCalled()
  })
})
