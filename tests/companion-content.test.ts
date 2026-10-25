import { describe, expect, it, vi } from 'vitest'
import { dailyOracle, drawTarot, shanghaiDay, tarotDeck } from '../src/shared/rituals'
import { companionFeatures, registerCompanionFeatures } from '../src/shared/companion-content'
import { createCompanionToolsPlugin } from '../src/main/agent/companion-plugin'
import { avatarActions } from '../src/shared/avatar'
import { PetBehaviorController } from '../src/shared/pet-behavior'
import { ShellRuntime } from '../src/main/bridge/runtime'

describe('offline companion experiences', () => {
  it('draws unique cards and valid orientations without mutating the shared deck', () => {
    const original = structuredClone(tarotDeck)
    for (let i = 0; i < 100; i++) {
      const reading = drawTarot('财运心态', 'three', '今天怎样专注？')
      expect(new Set(reading.draws.map(d => d.card.id)).size).toBe(3)
      expect(reading.draws.every(d => tarotDeck.some(card => card.id === d.card.id) && typeof d.reversed === 'boolean')).toBe(true)
      expect(reading.draws.map(d => d.position)).toEqual(['此刻', '留意', '下一小步'])
    }
    expect(tarotDeck).toEqual(original)
    const mutable = drawTarot('心情', 'single')
    mutable.draws[0].card.name = 'caller edit'
    expect(tarotDeck).toEqual(original)
    expect(drawTarot('心情', 'single').draws).toHaveLength(1)
    expect(tarotDeck).toHaveLength(22)
  })
  it('rejects invalid input or random providers instead of producing invalid cards', () => {
    expect(() => drawTarot('心情', 'three', 'x'.repeat(121))).toThrow()
    for (const n of [1, -1, NaN, Infinity]) expect(() => drawTarot('心情', 'single', '', () => n)).toThrow(/random/)
  })
  it('keeps a daily sign stable and rolls over at Shanghai midnight', () => {
    const before = Date.parse('2026-10-25T15:59:59Z'), after = before + 1000
    expect(shanghaiDay(before)).toBe('2026-10-25')
    expect(shanghaiDay(after)).toBe('2026-10-26')
    expect(dailyOracle(shanghaiDay(after), '工作')).toEqual(dailyOracle('2026-10-26', '工作'))
    expect(dailyOracle('2026-10-26').note).toMatch(/娱乐.*不.*投资/)
  })
  it('allows new feature registrations and catches conflicts and empty prompts early', () => {
    expect(registerCompanionFeatures(companionFeatures, [{ id: 'demo', title: '学习', subtitle: '一起读书', category: '金融日常', kind: 'prompt', icon: 'coffee', tone: 'sand', prompt: '陪我学一个概念' }])).toHaveLength(10)
    expect(() => registerCompanionFeatures(companionFeatures, companionFeatures)).toThrow(/Duplicate/)
    expect(() => registerCompanionFeatures([{ ...companionFeatures[0], kind: 'prompt' }])).toThrow(/Missing prompt/)
  })
  it('shares offline content with Pi, honors the injected clock and aborts before side effects', async () => {
    const performAction = vi.fn(), tools = createCompanionToolsPlugin({ performAction, now: () => Date.parse('2026-10-25T16:01:00Z'), random: () => .75 }).createTools({} as never)
    const get = (name: string) => tools.find(t => t.name === name)!
    const action = get('perform_avatar_action')
    await action.execute('a', { name: 'heart' })
    expect(performAction).toHaveBeenCalledWith('heart')
    const abort = new AbortController(); abort.abort()
    await expect(action.execute('b', { name: 'clap' }, abort.signal)).rejects.toThrow()
    expect(performAction).toHaveBeenCalledTimes(1)
    const result = await get('get_daily_oracle').execute('c', { topic: '心情' })
    expect(JSON.parse((result.content[0] as { text: string }).text).day).toBe('2026-10-26')
    const tarot = await get('draw_tarot').execute('d', { topic: '工作', spread: 'three' })
    expect(JSON.parse((tarot.content[0] as { text: string }).text).draws).toHaveLength(3)
  })
})
describe('expanded avatar actions', () => {
  it('keeps ambient gestures out of busy or unhappy states and yields to user interaction', () => {
    const behavior = new PetBehaviorController()
    expect(behavior.update('idle', 20, false)).toBe('idle')
    expect(behavior.update('idle', 21, true)).toBe('nod')
    behavior.interact('lifted', 22)
    expect(behavior.update('bullish', 80, true)).toBe('lifted')
    behavior.interact('land', 81)
    expect(behavior.update('bearish', 82, true)).toBe('comfort')
    expect(behavior.update('bearish', 90, true)).toBe('idle')
  })
  it('allows every published action through the authenticated shell contract', () => {
    const runtime = new ShellRuntime(() => {})
    runtime.enabled(true)
    const { sessionId } = runtime.claim({ name: 'Test harness' })
    runtime.event({ sessionId, seq: 1, taskId: 'gesture-test', type: 'task', title: 'Test actions', status: 'working' })
    for (const [index, name] of avatarActions.entries()) {
      expect(runtime.event({ sessionId, seq: index + 2, taskId: 'gesture-test', type: 'animate', name }).action?.name).toBe(name)
    }
  })
})
