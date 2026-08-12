import { describe, expect, it } from 'vitest'
import { alertTriggered, formatAlert, isAllowedMarketDataUrl, moodForQuote, normalizeQuoteTick } from '../src/shared/domain'
import type { PriceAlert, QuoteTick } from '../src/shared/types'

const quote: QuoteTick = {
  symbol: '600519.SH', name: '贵州茅台', price: 1721, previousClose: 1700,
  change: 21, changePct: 1.24, timestamp: Date.now(), status: 'open', sparkline: [1700, 1721]
}

describe('moodForQuote', () => {
  it('maps meaningful price moves to stable pet moods', () => {
    expect(moodForQuote(quote)).toBe('bullish')
    expect(moodForQuote({ ...quote, changePct: -1.2 })).toBe('bearish')
    expect(moodForQuote({ ...quote, changePct: 0.2 })).toBe('idle')
  })

  it('prioritizes alerts and detects stale quotes', () => {
    expect(moodForQuote(quote, true)).toBe('alert')
    expect(moodForQuote({ ...quote, timestamp: Date.now() - 16_000 })).toBe('offline')
  })
})

describe('price alerts', () => {
  const alert: PriceAlert = { id: 'a1', symbol: quote.symbol, direction: 'above', target: 1720, enabled: true }

  it('triggers on the configured boundary', () => {
    expect(alertTriggered(alert, quote)).toBe(true)
    expect(alertTriggered({ ...alert, direction: 'below', target: 1700 }, quote)).toBe(false)
  })

  it('honors the five minute cooldown', () => {
    expect(alertTriggered({ ...alert, lastTriggeredAt: 10_000 }, quote, 10_000 + 299_999)).toBe(false)
    expect(alertTriggered({ ...alert, lastTriggeredAt: 10_000 }, quote, 10_000 + 300_000)).toBe(true)
  })

  it('formats a user-facing message from deterministic values', () => {
    expect(formatAlert(alert, quote)).toBe('贵州茅台 突破 1720.00，现价 1721.00')
  })
})

describe('remote quote normalization', () => {
  it('rejects malformed or non-positive prices', () => {
    expect(normalizeQuoteTick(null)).toBeNull()
    expect(normalizeQuoteTick({ symbol: 'AAPL', price: -1 })).toBeNull()
    expect(normalizeQuoteTick({ symbol: '', price: 10 })).toBeNull()
  })

  it('fills optional fields without producing an invalid chart payload', () => {
    const normalized = normalizeQuoteTick({ symbol: 'AAPL', price: 235 }, undefined, 1234)
    expect(normalized).toMatchObject({
      symbol: 'AAPL', name: 'AAPL', price: 235, previousClose: 235,
      change: 0, changePct: 0, timestamp: 1234, status: 'open'
    })
    expect(normalized?.sparkline).toEqual([235, 235])
  })

  it('preserves known metadata and filters invalid sparkline points', () => {
    const normalized = normalizeQuoteTick({ symbol: quote.symbol, price: 1725, sparkline: [1720, 'bad', 1725] }, quote, 999)
    expect(normalized?.name).toBe('贵州茅台')
    expect(normalized?.previousClose).toBe(1700)
    expect(normalized?.sparkline).toEqual([1720, 1725])
  })
})

describe('market relay URL policy', () => {
  it('accepts secure relays and local development sockets', () => {
    expect(isAllowedMarketDataUrl('wss://quotes.example.com/ws')).toBe(true)
    expect(isAllowedMarketDataUrl('ws://127.0.0.1:8787')).toBe(true)
    expect(isAllowedMarketDataUrl('')).toBe(true)
  })

  it('rejects insecure remote or non-websocket URLs', () => {
    expect(isAllowedMarketDataUrl('ws://quotes.example.com/ws')).toBe(false)
    expect(isAllowedMarketDataUrl('https://quotes.example.com')).toBe(false)
    expect(isAllowedMarketDataUrl('not-a-url')).toBe(false)
  })
})
