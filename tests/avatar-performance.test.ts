import { describe, expect, it } from 'vitest'
import { avatarEmotions, conversationExpression, danceExpressionAt, formatExpressionTag, inferDialogueExpression, parseExpressionText, validateDanceExpressions } from '../src/shared/avatar-performance'
import { emptyChatState, type ChatState } from '../src/shared/chat'
import { applyPerformanceFace, PetExpressionController } from '../src/shared/pet-expression'
import { applyLayeredPerformance, layeredParameters } from '../src/shared/layered-avatar'
import { createWelcomeDance, dancePosition, validateMotion } from '../src/shared/dance'

const dialogue = (raw: string): ChatState => ({ ...emptyChatState(), messages: [
  { id: 'u', role: 'user', text: '今天有点累', timestamp: 0, status: 'done' },
  { id: 'a', role: 'assistant', timestamp: 1, status: 'streaming', text: parseExpressionText(raw, true).text, expressions: parseExpressionText(raw, true).cues }
] })

describe('semantic expressions without another model round trip', () => {
  it('round trips formatted directives and rejects invalid programmatic input', () => {
    for (const emotion of avatarEmotions) {
      const raw = formatExpressionTag({ emotion, intensity: .678 }) + '你好'
      expect(parseExpressionText(raw, true)).toMatchObject({ text: '你好', cues: [{ emotion, intensity: .68, offset: 0 }] })
    }
    for (const intensity of [-1, 1.1, Infinity, NaN]) expect(() => formatExpressionTag({ emotion: 'happy', intensity })).toThrow()
  })
  it('strips arbitrary token splits without rewriting already displayed or spoken text', () => {
    const raw = '[[emotion:caring]]辛苦啦。[普通文字] [[emotion:shy|0.6]]谢谢你喜欢我。'
    let previous = ''
    for (let n = 1; n <= raw.length; n++) {
      const result = parseExpressionText(raw.slice(0, n))
      expect(result.text.startsWith(previous), `non-monotonic split at ${n}`).toBe(true)
      expect(result.text).not.toContain('[[emotion:')
      previous = result.text
    }
    expect(parseExpressionText(raw, true)).toEqual({ text: '辛苦啦。[普通文字] 谢谢你喜欢我。', cues: [
      { emotion: 'caring', intensity: .75, offset: 0, source: 'model' },
      { emotion: 'shy', intensity: .6, offset: '辛苦啦。[普通文字] '.length, source: 'model' }
    ] })
  })
  it('bounds malformed metadata, ignores unknown commands and preserves ordinary brackets', () => {
    expect(parseExpressionText('普通 [文字] 以及 [[example]]。', true).text).toBe('普通 [文字] 以及 [[example]]。')
    expect(parseExpressionText('你好。[[emo', true).text).toBe('你好。')
    expect(parseExpressionText('你好。[[emotion:shy', true).text).toBe('你好。')
    expect(parseExpressionText('[[emotion:execute]]正文[[emotion:sad|1.5]]继续', true)).toEqual({ text: '正文继续', cues: [] })
    expect(parseExpressionText('[[emotion:invalid\n后面的正文', true).text).toBe('\n后面的正文')
    expect(parseExpressionText('[[emotion:happy]]'.repeat(99), true).cues).toHaveLength(12)
  })
  it('respects distress and explicit neutral requests without guessing market sentiment', () => {
    expect(inferDialogueExpression('我今天亏了，但别笑')).toMatchObject({ emotion: 'neutral' })
    expect(inferDialogueExpression('今天亏了，心情不好')).toMatchObject({ emotion: 'caring' })
    expect(inferDialogueExpression('Debby你好可爱')).toMatchObject({ emotion: 'shy' })
    expect(inferDialogueExpression('我终于完成了')).toMatchObject({ emotion: 'proud' })
    expect(inferDialogueExpression('上证今天涨了多少？')).toBeUndefined()
  })
  it('waits for actual audio, follows sentence offsets and discards old or cancelled turns', () => {
    const chat = dialogue('[[emotion:caring]]先休息一下。[[emotion:proud]]你已经做得很好啦。')
    expect(conversationExpression(chat, true)).toBeUndefined()
    expect(conversationExpression(chat, true, { lineId: 'a', textOffset: 0, textLength: 6 })?.directive.emotion).toBe('caring')
    expect(conversationExpression(chat, true, { lineId: 'a', textOffset: 6, textLength: 9 })?.directive.emotion).toBe('proud')
    expect(conversationExpression(chat)?.directive.emotion).toBe('proud')
    chat.messages[1].status = 'cancelled'
    expect(conversationExpression(chat)).toBeUndefined()
    chat.messages[1].status = 'done'
    chat.messages.push({ id: 'u2', role: 'user', text: '下一句', timestamp: 2, status: 'done' })
    expect(conversationExpression(chat, true, { lineId: 'a', textOffset: 0, textLength: 6 })).toBeUndefined()
  })
})

describe('face and dance channels remain independent', () => {
  it('overrides contradictory index expressions while retaining real mouth amplitude', () => {
    const original = new PetExpressionController().update('bearish', 'comfort', 1, .65)
    for (const emotion of avatarEmotions) {
      const face = applyPerformanceFace(original, { emotion, intensity: .8 }, .65)
      expect(face.weights.aa).toBe(.65)
      expect(face.weights.smile + face.weights.oh + face.weights.wink).toBe(0)
      expect(Object.values(face.weights).every(n => n >= 0 && n <= 1)).toBe(true)
    }
    expect(applyPerformanceFace(original, { emotion: 'shy', intensity: .8 }).weights.sad).toBe(0)
    expect(applyPerformanceFace(original, { emotion: 'caring', intensity: .8 }).weights.star).toBe(0)
    const reduced = applyPerformanceFace(original, { emotion: 'playful', intensity: 1 }, 0, true)
    expect([reduced.headTilt, reduced.headPitch, reduced.weights.wink]).toEqual([0, 0, 0])
    expect(original.weights.aa).toBe(.65)
  })
  it('maps all emotions onto 2.5D parameters without replacing speech or leaving stale eye scales', () => {
    const params = layeredParameters({ time: 2, mood: 'bullish', behavior: 'idle', mouth: .55, gaze: { x: 0, y: 0 } })
    for (const emotion of avatarEmotions) {
      const face = applyLayeredPerformance(params, { emotion, intensity: .8 })
      expect(face.mouthOpen).toBe(.55)
      expect(Object.values(face).every(Number.isFinite)).toBe(true)
    }
    expect(applyLayeredPerformance(params, { emotion: 'surprised', intensity: 1 }).irisScale).toBeLessThan(1)
    expect(applyLayeredPerformance(params).irisScale).toBe(1)
    expect(applyLayeredPerformance(params, { emotion: 'caring', intensity: 1 }).mouthForm).toBe(.35)
  })
  it('round-trips a portable timeline without modifying body tracks and follows pause, seek and loop time', () => {
    const motion = createWelcomeDance()
    motion.expressions = [{ time: 0, duration: 2, emotion: 'shy', intensity: .6 }, { time: 4, duration: 4, emotion: 'proud', intensity: .8 }]
    const parsed = validateMotion(JSON.parse(JSON.stringify(motion)))
    expect(JSON.stringify(parsed.tracks)).toBe(JSON.stringify(motion.tracks))
    expect(parsed.expressions).toEqual(motion.expressions)
    const playback = { id: 'welcome', status: 'paused' as const, offset: 4.5, startedAt: 1000, speed: 1, loop: true, origin: 'user' as const }
    expect(danceExpressionAt(dancePosition(playback, 8, 5000), 8, 'auto', parsed.expressions)?.emotion).toBe('proud')
    expect(danceExpressionAt(3, 8, 'auto', parsed.expressions)).toBeUndefined()
    const looped = dancePosition({ ...playback, status: 'playing', offset: 7 }, 8, 3000)
    expect(looped).toBe(1)
    expect(danceExpressionAt(looped, 8, 'auto', parsed.expressions)?.emotion).toBe('shy')
    expect(danceExpressionAt(0, 8, 'gentle')?.emotion).toBe('caring')
    expect(danceExpressionAt(0, 8, 'off', parsed.expressions)).toBeUndefined()
  })
  it('rejects unbounded, unknown, non-finite or ambiguous timeline entries', () => {
    const cue = { time: 0, duration: 2, emotion: 'happy', intensity: .7 }
    for (const invalid of [[{ ...cue, emotion: 'execute' }], [{ ...cue, time: NaN }], [{ ...cue, intensity: 2 }], [{ ...cue, time: 8 }], [cue, cue], Array(65).fill(cue)]) {
      expect(() => validateDanceExpressions(invalid, 8)).toThrow()
    }
  })
})
