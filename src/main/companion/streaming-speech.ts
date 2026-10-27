import type { SpeechMark, SpeechPacket } from '../../shared/voice'
import { voiceLimits } from '../../shared/voice'
import { SpeechTextBuffer } from '../../shared/speech-text'
import { voiceError, type SpeechProvider } from './qwen'

/** One cancellable reply. Serial synthesis prefetches the next phrase while previous audio plays. */
export class StreamingSpeech {
  private buffer = new SpeechTextBuffer()
  private lineId?: string
  private text = ''
  private characters = 0
  private phrases = 0
  private bytes = 0
  private sequence = 0
  private pending: { text: string; mark: SpeechMark }[] = []
  private lineOffset = 0
  private task?: Promise<void>
  private ended = false
  private terminal = false
  private controller = new AbortController()
  private signal: AbortSignal
  constructor(private provider: Pick<SpeechProvider, 'synthesize' | 'synthesizeStream'>, signal: AbortSignal,
    private deliver: (packet: SpeechPacket) => void, private fail: (message: string) => void) {
    this.signal = AbortSignal.any([signal, this.controller.signal])
    this.signal.addEventListener('abort', () => { this.pending = []; this.text = ''; this.buffer = new SpeechTextBuffer() }, { once: true })
  }
  update(lineId: string, text: string, done: boolean): void {
    if (this.signal.aborted || this.terminal || this.ended) return
    try {
      if (lineId !== this.lineId) {
        if (this.lineId) this.enqueuePhrases(this.buffer.update(this.text, true), this.text, this.lineId)
        this.buffer = new SpeechTextBuffer(); this.text = ''; this.lineId = lineId; this.lineOffset = 0
      }
      this.characters += Math.max(0, text.length - this.text.length)
      if (this.characters > 1200) throw new Error('回复文本过长，朗读已停止，文字回复会保留。')
      this.enqueuePhrases(this.buffer.update(text, done), text, lineId); this.text = text
      this.ended = done
      if (!this.task) this.kick()
    } catch (error) { this.error(error) }
  }
  private enqueuePhrases(phrases: string[], text: string, lineId: string): void {
    for (const phrase of phrases) {
      const offset = Math.max(this.lineOffset, text.indexOf(phrase, this.lineOffset))
      this.pending.push({ text: phrase, mark: { lineId, textOffset: offset, textLength: phrase.length } })
      this.lineOffset = offset + phrase.length
    }
  }
  private error(error: unknown): void {
    if (this.terminal || this.signal.aborted) return
    this.terminal = true; this.pending = []
    this.fail(voiceError(error))
    this.controller.abort()
  }
  private kick(): void {
    this.task = this.drain().catch((error) => this.error(error)).finally(() => {
      this.task = undefined
      if (!this.signal.aborted && !this.terminal && (this.pending.length || this.ended)) this.kick()
    })
  }
  private emit(packet: SpeechPacket): void {
    try { if (!this.signal.aborted && !this.terminal) this.deliver(packet) }
    finally { packet.bytes.fill(0) }
  }
  private async drain(): Promise<void> {
    while (this.pending.length && !this.signal.aborted && !this.terminal) {
      if (++this.phrases > 32) throw new Error('语音分句超过大小限制。')
      const { text, mark } = this.pending.shift()!
      let first = true
      const stream = this.provider.synthesizeStream?.(text, this.signal)
      if (stream) {
        for await (const chunk of stream) {
          if (this.signal.aborted || this.terminal) { chunk.bytes.fill(0); return }
          this.bytes += chunk.bytes.length
          if (this.bytes > voiceLimits.responseBytes) { chunk.bytes.fill(0); throw new Error('音频流超过大小限制。') }
          this.emit({ ...chunk, mark: first ? mark : undefined, sequence: this.sequence++, done: false }); first = false
        }
      } else {
        const bytes = await this.provider.synthesize(text, this.signal)
        this.bytes += bytes.length
        if (this.bytes > voiceLimits.responseBytes) { bytes.fill(0); throw new Error('音频流超过大小限制。') }
        this.emit({ bytes, format: 'encoded', mark, sequence: this.sequence++, done: false })
      }
    }
    if (this.ended && !this.terminal && !this.signal.aborted) {
      this.emit({ bytes: new Uint8Array(), format: 'pcm16', sequence: this.sequence++, done: true })
      this.terminal = true; this.text = ''; this.buffer = new SpeechTextBuffer()
    }
  }
  async waitForIdle(): Promise<void> { while (this.task) await this.task }
  cancel(): void { this.controller.abort() }
}
