import { describe, expect, it } from 'vitest'
import { PetBehaviorController } from '../src/shared/pet-behavior'
import { stableIndexMood } from '../src/shared/domain'
import { buildMarketRecap, recapText } from '../src/shared/recap'
import { showcaseScenes, showcaseSnapshot } from '../src/shared/showcase'

const now = Date.parse('2026-10-07T15:05:00+08:00')
const quotes = showcaseSnapshot('close', now).quotes

describe('companion behavior', () => {
  it('keeps a lifted pet lifted until release and recovers after landing', () => {
    const controller = new PetBehaviorController()
    controller.interact('lifted', 0)
    expect(controller.update('bullish', 30)).toBe('lifted')
    controller.interact('land', 30)
    expect(controller.update('bullish', 30.5)).toBe('land')
    expect(controller.update('bullish', 31)).toBe('idle')
  })

  it('gives user interactions priority over market gestures', () => {
    const controller = new PetBehaviorController()
    controller.interact('pat', 1)
    expect(controller.update('bearish', 1.5)).toBe('pat')
    expect(controller.update('bearish', 4)).toBe('idle')
    expect(controller.update('alert', 4.1)).toBe('notify')
  })

  it('does not replay reactions on every quote or rapidly oscillating mood', () => {
    const controller = new PetBehaviorController()
    expect(controller.update('bullish', 0)).toBe('celebrate')
    expect(controller.update('bullish', 3)).toBe('idle')
    expect(controller.update('bearish', 3.1)).toBe('idle')
    expect(controller.update('bullish', 9)).toBe('celebrate')
  })
})

describe('index mood hysteresis', () => {
  it('retains a mood in the exit band but not through neutral or a disconnect', () => {
    const index = { ...quotes[0], status: 'open' as const, timestamp: now }
    expect(stableIndexMood({ ...index, changePct: 0.14 }, 'bullish', false, 'live', now)).toBe('bullish')
    expect(stableIndexMood({ ...index, changePct: -0.14 }, 'bearish', false, 'live', now)).toBe('bearish')
    expect(stableIndexMood({ ...index, changePct: 0.02 }, 'bullish', false, 'live', now)).toBe('idle')
    expect(stableIndexMood(index, 'bullish', false, 'offline', now)).toBe('offline')
  })
})

describe('market recap integrity', () => {
  it('uses the source timestamp, including a previous trading day during a holiday', () => {
    const recap = buildMarketRecap(quotes, 'public', '腾讯公开行情', 'live', now + 3 * 86_400_000)!
    expect(recap.title).toBe('收盘快照')
    expect(recap.date).toBe('2026-10-07')
    expect(recap.time).toBe('15:00')
    expect(recap.demo).toBe(false)
    expect(recapText(recap)).toContain('腾讯公开行情')
  })

  it('does not call a lunch break or intraday quote a closing recap', () => {
    const lunch = quotes.map((quote) => ({ ...quote, timestamp: Date.parse('2026-10-07T11:30:00+08:00') }))
    expect(buildMarketRecap(lunch, 'public', '公开行情', 'live', now)?.title).toBe('行情快照')
    expect(buildMarketRecap(showcaseSnapshot('bullish', now).quotes, 'demo', '演示', 'demo', now)?.title).toBe('行情快照')
  })

  it('labels offline caches and excludes instruments from other dates or times', () => {
    const mixed = [...quotes, { ...quotes[1], symbol: 'old', timestamp: now - 86_400_000 }, { ...quotes[2], symbol: 'late', timestamp: now }]
    const recap = buildMarketRecap(mixed, 'public', '公开行情', 'offline', now)!
    expect(recap.cached).toBe(true)
    expect(recap.quotes).toHaveLength(4)
    expect(recap.rising + recap.falling + recap.unchanged).toBe(4)
    expect(recapText(recap)).toContain('离线或延迟缓存')
  })

  it('rejects missing, invalid or future benchmark data', () => {
    expect(buildMarketRecap([], 'public', '', 'live', now)).toBeNull()
    expect(buildMarketRecap([{ ...quotes[0], timestamp: NaN }], 'public', '', 'live', now)).toBeNull()
    expect(buildMarketRecap([{ ...quotes[0], timestamp: now + 61_000 }], 'public', '', 'live', now)).toBeNull()
  })
})

describe('controlled showcase', () => {
  it('creates deterministic labelled snapshots without mutating real quotes', () => {
    const original = JSON.stringify(quotes)
    for (const scene of showcaseScenes) {
      expect(showcaseSnapshot(scene, now)).toEqual(showcaseSnapshot(scene, now))
      expect(showcaseSnapshot(scene, now).quotes).toHaveLength(4)
    }
    expect(JSON.stringify(quotes)).toBe(original)
    expect(showcaseSnapshot('alert', now).alerting).toBe(true)
    expect(showcaseSnapshot('offline', now).providerStatus).toBe('offline')
    expect(buildMarketRecap(quotes, 'demo', '场景演示', 'demo', now)?.demo).toBe(true)
  })

  it('can demonstrate a close before the actual closing time without future data', () => {
    const morning = Date.parse('2026-10-07T09:00:00+08:00')
    const snapshot = showcaseSnapshot('close', morning)
    expect(snapshot.quotes[0].timestamp).toBeLessThan(morning)
    expect(buildMarketRecap(snapshot.quotes, 'demo', '演示', 'demo', morning)?.title).toBe('收盘快照')
  })
})
