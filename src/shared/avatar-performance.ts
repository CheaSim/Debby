import type { ChatState } from './chat'
import type { SpeechMark } from './voice'
/** Renderer/provider independent facial performance. Mouth amplitude remains a separate channel. */
export const avatarEmotions = ['neutral', 'happy', 'caring', 'sad', 'shy', 'surprised', 'curious', 'playful', 'proud'] as const
export type AvatarEmotion = typeof avatarEmotions[number]
export interface ExpressionDirective { emotion: AvatarEmotion; intensity: number }
export interface DialogueExpressionCue extends ExpressionDirective { offset: number; source: 'model' | 'fallback' }
export interface AvatarPerformance extends ExpressionDirective { id: string; source: 'conversation' | 'agent' | 'dance' | 'preview'; expiresAt: number }
export const emotionLabels: Record<AvatarEmotion, string> = { neutral: '平静', happy: '开心', caring: '温柔安慰', sad: '低落', shy: '害羞', surprised: '惊讶', curious: '好奇', playful: '俏皮', proud: '为你骄傲' }
export const expressionProtocol = {
  name: 'debby.expression', version: 1, syntax: '[[emotion:NAME|INTENSITY]]',
  emotions: avatarEmotions, defaultIntensity: .75, maxCues: 12, offsetUnit: 'utf16',
  agentDurationMs: 6500, typedExpressionPrecedence: true
} as const
export function formatExpressionTag({ emotion, intensity }: ExpressionDirective): string {
  if (!avatarEmotions.includes(emotion) || !Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new Error('表情或强度无效。')
  return `[[emotion:${emotion}|${Number(intensity.toFixed(2))}]]`
}
export const expressionPrompt = `Debby Expression v1 表情协议：自然回复开头使用一个隐藏标记 [[emotion:名称]] 或 [[emotion:名称|强度]]，强度为 0 到 1，最多两位小数，省略为 0.75。名称只能为 neutral/happy/caring/sad/shy/surprised/curious/playful/proud。需要时可在语气转折处再用，整条最多 3 个；正文照常自然说话，不解释标记。安慰用户用 caring，用户难过时不要庆祝；受到夸奖可 shy，开玩笑可 playful，替用户肯定努力可 proud。标记只驱动脸部，不表示已执行身体动作或跳舞。`

const prefix = '[[emotion:'
/** Reparse cumulative text so arbitrary token splits never expose control syntax to UI/TTS. */
export function parseExpressionText(raw: string, done = false): { text: string; cues: DialogueExpressionCue[] } {
  let text = '', at = 0
  const cues: DialogueExpressionCue[] = []
  while (at < raw.length) {
    const start = raw.indexOf(prefix, at)
    if (start < 0) { text += raw.slice(at); break }
    text += raw.slice(at, start)
    const end = raw.indexOf(']]', start + prefix.length)
    if (end < 0) {
      // Bound malformed metadata; preserve following ordinary text after a line break.
      const newline = raw.indexOf('\n', start)
      if (newline >= 0) { at = newline; continue }
      if (raw.length - start > 80) { at = start + prefix.length; continue }
      break
    }
    const value = raw.slice(start + prefix.length, end)
    const match = /^([a-z]+)(?:\|([01](?:\.\d{1,2})?))?$/.exec(value)
    if (match && avatarEmotions.includes(match[1] as AvatarEmotion) && cues.length < expressionProtocol.maxCues) {
      const intensity = match[2] === undefined ? expressionProtocol.defaultIntensity : Number(match[2])
      if (intensity <= 1) cues.push({ emotion: match[1] as AvatarEmotion, intensity, offset: text.length, source: 'model' })
    }
    at = end + 2
  }
  for (let length = Math.min(prefix.length - 1, text.length); length >= (done ? 2 : 1); length--) {
    if (text.endsWith(prefix.slice(0, length))) { text = text.slice(0, -length); break }
  }
  return { text, cues }
}

/** Conservative, replaceable fallback for providers which ignore the expression protocol. */
export function inferDialogueExpression(user: string, reply = ''): ExpressionDirective | undefined {
  const text = user.slice(-800)
  if (/(别|不要|不想|停止).{0,4}(笑|开心|卖萌|做表情)/.test(text)) return { emotion: 'neutral', intensity: .8 }
  if (/(难过|失落|孤独|焦虑|压力|很累|有点累|亏损|亏了|赔了|不开心|不高兴|哭了|伤心|失眠)/.test(text)) return { emotion: 'caring', intensity: .75 }
  if (/(你|Debby).{0,8}(可爱|漂亮|好看)|喜欢你|爱你/i.test(text)) return { emotion: 'shy', intensity: .7 }
  if (/(我|今天).{0,12}(成功了|做到了|完成了|坚持住了)|终于.{0,8}(通过|完成|成功)/.test(text)) return { emotion: 'proud', intensity: .8 }
  if (/(讲个|说个).{0,4}(笑话|段子)|逗我|开个玩笑/.test(text)) return { emotion: 'playful', intensity: .7 }
  if (/太(开心|高兴)了|好开心|好消息/.test(text)) return { emotion: 'happy', intensity: .75 }
  if (/我陪你|慢慢来|先休息|抱抱/.test(reply)) return { emotion: 'caring', intensity: .6 }
  return undefined
}

/** Sentence-level synchronization. A new user turn or cancellation invalidates previous cues. */
export function conversationExpression(chat: ChatState, audioExpected = false, mark?: SpeechMark): { id: string; directive: ExpressionDirective } | undefined {
  if (chat.error) return undefined
  const userIndex = chat.messages.map(line => line.role).lastIndexOf('user')
  const replies = chat.messages.slice(userIndex + 1).filter(line => line.role === 'assistant')
  const line = audioExpected ? replies.find(line => line.id === mark?.lineId) : replies.at(-1)
  if (!line || !line.text.trim() || line.status === 'error' || line.status === 'cancelled') return undefined
  const user = chat.messages[userIndex]?.text ?? ''
  const fallback = inferDialogueExpression(user, line.text)
  const cues = line.expressions ?? (fallback ? [{ ...fallback, offset: 0, source: 'fallback' as const }] : [])
  const end = audioExpected && mark ? mark.textOffset + Math.max(1, mark.textLength) : line.text.length + 1
  const cue = cues.slice().reverse().find(cue => cue.offset < end)
  if (!cue || !avatarEmotions.includes(cue.emotion) || !Number.isFinite(cue.intensity)) return undefined
  return { id: `${line.id}:${cue.source}:${cue.offset}:${cue.emotion}:${cue.intensity}${audioExpected && mark ? `:spoken-${mark.textOffset}` : ''}`, directive: { emotion: cue.emotion, intensity: Math.max(0, Math.min(1, cue.intensity)) } }
}

export const danceExpressionStyles = ['auto', 'gentle', 'bright', 'playful', 'off'] as const
export type DanceExpressionStyle = typeof danceExpressionStyles[number]
export const danceExpressionLabels: Record<DanceExpressionStyle, string> = { auto: '自动编排', gentle: '温柔陪伴', bright: '元气舞台', playful: '俏皮互动', off: '只跳动作' }
export interface DanceExpressionCue extends ExpressionDirective { time: number; duration: number }
export function validateDanceExpressions(value: unknown, duration: number): DanceExpressionCue[] | undefined {
  if (value === undefined) return undefined
  if (!Number.isFinite(duration) || duration <= 0) throw Error('舞蹈表情需要有效的动作时长。')
  if (!Array.isArray(value) || value.length > 64) throw Error('舞蹈表情时间轴最多 64 个节点。')
  let previous = -1
  return value.map(cue => {
    if (!cue || !avatarEmotions.includes(cue.emotion) || !Number.isFinite(cue.time) || cue.time < 0 || cue.time >= duration || cue.time <= previous || !Number.isFinite(cue.duration) || cue.duration < .2 || cue.duration > 20 || !Number.isFinite(cue.intensity) || cue.intensity < 0 || cue.intensity > 1) throw Error('舞蹈表情节点、时间或强度不正确。')
    previous = cue.time
    return { time: cue.time, duration: Math.min(cue.duration, duration - cue.time), emotion: cue.emotion, intensity: cue.intensity }
  })
}
export function danceExpressionAt(time: number, duration: number, style: DanceExpressionStyle = 'auto', custom?: DanceExpressionCue[]): ExpressionDirective | undefined {
  if (style === 'off' || !Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) return undefined
  if (style === 'auto' && custom?.length) {
    const cue = custom.slice().reverse().find(c => c.time <= time)
    return cue && time < cue.time + cue.duration ? { emotion: cue.emotion, intensity: cue.intensity } : undefined
  }
  const sequences: Record<string, AvatarEmotion[]> = { gentle: ['caring', 'happy', 'shy', 'caring'], bright: ['happy', 'proud', 'playful', 'happy'], playful: ['playful', 'shy', 'surprised', 'happy'] }
  const sequence = sequences[style] ?? sequences.bright
  return { emotion: sequence[Math.min(3, Math.floor(Math.max(0, time) / duration * 4))], intensity: style === 'gentle' ? .55 : .8 }
}
