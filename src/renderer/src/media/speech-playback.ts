import { voiceLimits, type SpeechChunk, type SpeechMark } from '../../../shared/voice'

/** Schedules PCM blocks on one audio clock; encoded-file providers use the same ordered queue. */
export class BrowserSpeechPlayback {
  private context = new AudioContext()
  private analyser = this.context.createAnalyser()
  private sources = new Map<AudioBufferSourceNode, AudioBuffer>()
  private chunks = new Set<Uint8Array>()
  private chain = Promise.resolve()
  private generation = 0
  private nextTime = 0
  private duration = 0
  private pending = 0
  private frame = 0
  private marks: { at: number; mark: SpeechMark }[] = []
  constructor(private onLevel: (level: number) => void, private onPlaying: (playing: boolean) => void, private onMark?: (mark: SpeechMark | undefined) => void) {
    this.analyser.fftSize = 256; this.analyser.connect(this.context.destination)
    void this.context.resume().catch(() => {})
  }
  enqueue(chunk: SpeechChunk): Promise<void> {
    const generation = this.generation, bytes = chunk.bytes
    this.chunks.add(bytes); this.pending++
    const task = this.chain.then(async () => {
      if (generation !== this.generation || this.context.state === 'closed') return
      if (!bytes.length || bytes.length > voiceLimits.responseBytes) throw new Error('无效音频大小。')
      let buffer: AudioBuffer
      if (chunk.format === 'pcm16') {
        if (!chunk.sampleRate || ![8000, 12000, 16000, 22050, 24000, 44100, 48000].includes(chunk.sampleRate) || bytes.length % 2) throw new Error('无效音频 PCM 格式。')
        buffer = this.context.createBuffer(1, bytes.length / 2, chunk.sampleRate)
        const samples = buffer.getChannelData(0), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768
      } else buffer = await this.context.decodeAudioData(new Uint8Array(bytes).buffer)
      bytes.fill(0)
      if (generation !== this.generation || this.context.state as string === 'closed') { this.clearBuffer(buffer); return }
      this.duration += buffer.duration
      if (this.duration > voiceLimits.playbackSeconds) { this.clearBuffer(buffer); throw new Error('音频超过时长限制。') }
      await this.context.resume()
      if (generation !== this.generation || this.context.state as string === 'closed') { this.clearBuffer(buffer); return }
      const source = this.context.createBufferSource(); source.buffer = buffer; source.connect(this.analyser)
      const at = Math.max(this.context.currentTime + 0.045, this.nextTime)
      this.nextTime = at + buffer.duration
      if (chunk.mark) this.marks.push({ at, mark: { ...chunk.mark } })
      this.sources.set(source, buffer)
      source.onended = () => { this.dispatchMarks(); this.sources.delete(source); source.disconnect(); this.clearBuffer(buffer); this.idle() }
      source.start(at); this.onPlaying(true); this.animate()
    }).finally(() => {
      bytes.fill(0); this.chunks.delete(bytes)
      if (generation === this.generation) { this.pending--; this.idle() }
    })
    this.chain = task.catch(() => {})
    return task
  }
  private clearBuffer(buffer: AudioBuffer): void { for (let i = 0; i < buffer.numberOfChannels; i++) buffer.getChannelData(i).fill(0) }
  private dispatchMarks(): void { while (this.marks[0]?.at <= this.context.currentTime) this.onMark?.(this.marks.shift()!.mark) }
  private idle(): void {
    if (this.sources.size || this.pending) return
    cancelAnimationFrame(this.frame); this.frame = 0; this.onLevel(0); this.onPlaying(false)
  }
  private animate(): void {
    if (this.frame) return
    const samples = new Float32Array(this.analyser.fftSize)
    let last = 0
    const update = (now: number) => {
      this.frame = requestAnimationFrame(update)
      if (now - last < 40) return
      this.dispatchMarks()
      last = now; this.analyser.getFloatTimeDomainData(samples)
      this.onLevel(Math.min(1, Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) * 5))
    }
    this.frame = requestAnimationFrame(update)
  }
  stop(): void {
    this.generation++; cancelAnimationFrame(this.frame); this.frame = 0
    for (const [source, buffer] of this.sources) { source.onended = null; try { source.stop() } catch {} source.disconnect(); this.clearBuffer(buffer) }
    this.sources.clear(); this.chunks.forEach((bytes) => bytes.fill(0)); this.chunks.clear()
    this.chain = Promise.resolve(); this.nextTime = 0; this.duration = 0; this.pending = 0
    this.marks = []; this.onMark?.(undefined)
    this.onLevel(0); this.onPlaying(false)
  }
  close(): void { this.stop(); this.analyser.disconnect(); void this.context.close().catch(() => {}) }
}
