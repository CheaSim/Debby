import { emptyChatState, type ChatState } from './chat'

export interface VoiceConfig {
  configured: boolean
  baseUrl: string
  textModel: string
  asrModel: string
  ttsModel: string
  voice: string
  storage: 'env' | 'encrypted' | 'none'
  vision: boolean
  tokenPlan: boolean
}
export interface VoiceConfigInput {
  apiKey?: string
  baseUrl: string
  textModel: string
  asrModel: string
  ttsModel: string
  voice: string
}
export interface VoiceState {
  revision: number
  config: VoiceConfig
  sessionId?: string
  turnId?: string
  active: boolean
  cameraAllowed: boolean
  phase: 'off' | 'ready' | 'transcribing' | 'thinking' | 'synthesizing'
  expiresAt?: number
  chat: ChatState
  error?: string
}
export interface VoiceTurn { sessionId: string; text?: string; audio?: Uint8Array; image?: string }
export interface VoiceAudio { sessionId: string; turnId: string; bytes: Uint8Array }
export interface VoiceApi {
  getVoiceState: () => Promise<VoiceState>
  configureVoice: (input: VoiceConfigInput) => Promise<VoiceState>
  startVoice: (input: { cloudConsent: boolean; camera: boolean }) => Promise<VoiceState>
  stopVoice: () => Promise<void>
  authorizeVoiceMedia: (kind: 'audio' | 'video') => Promise<void>
  releaseVoiceMedia: (kind: 'audio' | 'video') => Promise<void>
  sendVoiceTurn: (turn: VoiceTurn) => Promise<void>
  interruptVoice: () => Promise<void>
  clearVoice: () => Promise<void>
  onVoiceState: (listener: (state: VoiceState) => void) => () => void
  onVoiceAudio: (listener: (audio: VoiceAudio) => void) => () => void
}
export const voiceLimits = { captureSeconds: 30, sessionMs: 15 * 60_000, audioBytes: 960_044, imageChars: 280_000, playbackSeconds: 120, responseBytes: 8_000_000 } as const
export function emptyVoiceState(): VoiceState {
  return { revision: 0, active: false, cameraAllowed: false, phase: 'off', chat: emptyChatState(),
    config: { configured: false, baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1', textModel: 'qwen3.8-flash',
      asrModel: 'qwen-audio-3.0-asr-flash', ttsModel: 'qwen-audio-3.0-tts-plus', voice: 'longanhuan_v3.6', storage: 'none', vision: true, tokenPlan: true } }
}
