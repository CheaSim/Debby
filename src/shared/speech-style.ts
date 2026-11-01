export const speechStyles = ['bright', 'gentle', 'shy', 'professional', 'natural', 'custom'] as const
export type SpeechStyle = typeof speechStyles[number]
export interface SpeechStyleConfig { style?: SpeechStyle; instruction?: string; rate?: number; pitch?: number }
export const speechPresets: Record<Exclude<SpeechStyle, 'custom'>, { label: string; instruction: string; rate: number; pitch: number }> = {
  bright: { label: '元气 · 可爱', instruction: '请用自然的普通话，以可爱活泼的动漫少女口吻说话，声音轻盈明亮，语调有自然起伏，带一点笑意，像熟悉的朋友聊天。表达清楚，不要尖叫，不要过度撒娇。', rate: 1.03, pitch: 1.02 },
  gentle: { label: '温柔 · 陪伴', instruction: '请用自然的普通话，以温柔可爱的动漫少女口吻说话，声音柔和，语速舒缓，停顿自然，像朋友一样耐心陪伴。不要夸张或刻意拖长尾音。', rate: .96, pitch: 1 },
  shy: { label: '害羞 · 轻声', instruction: '请用自然的普通话，以可爱、略带害羞的动漫少女口吻说话，语气轻柔亲近，带一点含蓄的笑意，吐字清楚，停顿自然，不要过度气声或夸张结巴。', rate: .98, pitch: 1.01 },
  professional: { label: '认真 · 看行情', instruction: '请用自然的普通话，以亲切明亮的年轻女声讲解，语气认真清晰、从容自然，准确读出数字与金融术语，像可爱的金融小助手在耐心说明。', rate: 1, pitch: 1 },
  natural: { label: '自然 · 原音色', instruction: '', rate: 1, pitch: 1 }
}
export const speechPreviewText = '嗨，我是 Debby！今天也陪你一起看行情。慢慢来，我们一步一步就好。'
export function resolveSpeechStyle(input?: SpeechStyleConfig) {
  const style = input?.style ?? 'bright', preset = speechPresets[style === 'custom' ? 'bright' : style]
  return { style, instruction: style === 'custom' ? input?.instruction?.trim() ?? '' : preset.instruction, rate: input?.rate ?? preset.rate, pitch: input?.pitch ?? preset.pitch }
}
export function validateSpeechStyle(value: unknown): SpeechStyleConfig {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) throw Error('声音语气配置无效。')
  const input = (value ?? {}) as SpeechStyleConfig
  if (input.style !== undefined && !speechStyles.includes(input.style)) throw Error('请选择有效的声音语气。')
  if (input.instruction !== undefined && (typeof input.instruction !== 'string' || input.instruction.length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.instruction))) throw Error('语气指令需在 500 字以内。')
  for (const n of [input.rate, input.pitch]) if (n !== undefined && (typeof n !== 'number' || !Number.isFinite(n) || n < .5 || n > 2)) throw Error('语速和音调需在 0.5 至 2.0 之间。')
  return resolveSpeechStyle(input)
}
