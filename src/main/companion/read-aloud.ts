import { z } from 'zod'
import type { ReadAloudAudio, ReadAloudInput, ReadAloudStreamEvent, ReadAloudStreamInput, VoiceConfig } from '../../shared/voice'
import { voiceLimits } from '../../shared/voice'
import { voiceError, type SpeechProvider } from './qwen'
import { StreamingSpeech } from './streaming-speech'

const inputSchema = z.object({ requestId: z.string().regex(/^[\w.-]{1,100}$/), text: z.string().trim().min(1).max(1200), cloudConsent: z.literal(true) }).strict()
const streamSchema = inputSchema.extend({ text: z.string().min(1).max(1200).refine((value) => Boolean(value.trim())), lineId: z.string().regex(/^[\w.-]{1,100}$/), done: z.boolean() })
/** Speech only: independent of conversation, microphone and camera sessions. */
export class ReadAloudRuntime {
  private controller?: AbortController
  private streaming?: { id: string; speech: StreamingSpeech }
  constructor(private config: () => VoiceConfig, private provider: (config: VoiceConfig) => Pick<SpeechProvider, 'synthesize' | 'synthesizeStream'>) {}
  stream(input: ReadAloudStreamInput, deliver: (event: ReadAloudStreamEvent) => void): void {
    const parsed = streamSchema.safeParse(input)
    if (!parsed.success) throw new Error('请确认阿里云朗读授权，文本需为 1 至 1200 字。')
    const { requestId, lineId, text, done } = parsed.data
    if (this.streaming?.id !== requestId) {
      const config = this.config()
      if (!config.configured) throw new Error('请先配置阿里云 TTS Key。')
      this.cancel()
      const controller = new AbortController(); this.controller = controller
      let sequence = 0
      const speech = new StreamingSpeech(this.provider(config), controller.signal, (packet) => {
        sequence = packet.sequence + 1
        if (!controller.signal.aborted) deliver({ ...packet, requestId })
      }, (error) => {
        if (!controller.signal.aborted) deliver({ requestId, sequence: sequence++, done: true, bytes: new Uint8Array(), format: 'pcm16', error })
      })
      this.streaming = { id: requestId, speech }
    }
    this.streaming.speech.update(lineId, text, done)
  }
  async read(input: ReadAloudInput): Promise<ReadAloudAudio> {
    const parsed = inputSchema.safeParse(input)
    if (!parsed.success) throw new Error('请确认阿里云朗读授权，文本需为 1 至 1200 字。')
    const config = this.config()
    if (!config.configured) throw new Error('请先配置阿里云 TTS Key。')
    this.cancel()
    const controller = new AbortController()
    this.controller = controller
    try {
      const bytes = await this.provider(config).synthesize(parsed.data.text, controller.signal)
      if (controller.signal.aborted || this.controller !== controller) { bytes.fill(0); throw new Error('Stopped') }
      if (!bytes.length) throw new Error('服务返回了空响应。')
      if (bytes.length > voiceLimits.responseBytes) { bytes.fill(0); throw new Error('服务响应超过大小限制。') }
      return { requestId: parsed.data.requestId, bytes }
    } catch (error) {
      if (controller.signal.aborted) throw new Error('朗读已停止。')
      throw new Error(voiceError(error))
    } finally { if (this.controller === controller) this.controller = undefined }
  }
  cancel(): void { this.controller?.abort(); this.controller = undefined; this.streaming = undefined }
}
