import { voiceLimits } from '../../../shared/voice'

export interface VoiceCapture { finish: () => Promise<Uint8Array>; stop: () => void }
export interface VoicePlayback { play: (bytes: Uint8Array) => Promise<void>; stop: () => void; close: () => void }
export function pcm16Wav(samples: Float32Array, sampleRate = 16_000): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const data = new DataView(bytes.buffer)
  const tag = (at: number, text: string) => { for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i) }
  tag(0, 'RIFF'); tag(8, 'WAVE'); tag(12, 'fmt '); tag(36, 'data')
  data.setUint32(4, bytes.length - 8, true); data.setUint32(16, 16, true)
  data.setUint16(20, 1, true); data.setUint16(22, 1, true)
  data.setUint32(24, sampleRate, true); data.setUint32(28, sampleRate * 2, true)
  data.setUint16(32, 2, true); data.setUint16(34, 16, true); data.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => { const value = Math.max(-1, Math.min(1, Number.isFinite(sample) ? sample : 0)); data.setInt16(44 + index * 2, value * (value < 0 ? 32768 : 32767), true) })
  return bytes
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Stopped', 'AbortError'))
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Stopped', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
export async function openVoiceCapture(signal: AbortSignal, authorize: () => Promise<void>, onLevel: (level: number) => void): Promise<VoiceCapture> {
  const context = new AudioContext()
  let stream: MediaStream | undefined, recorder: AudioWorkletNode | undefined
  let stopped = false, finishing = false, count = 0
  const blocks: Float32Array[] = []
  let completeFlush: (() => void) | undefined, rejectFlush: ((error: Error) => void) | undefined
  const stop = () => {
    if (stopped) return
    stopped = true
    stream?.getTracks().forEach((track) => track.stop())
    if (recorder) { recorder.port.onmessage = null; recorder.port.close(); recorder.disconnect() }
    blocks.forEach((block) => block.fill(0)); blocks.length = 0
    rejectFlush?.(new DOMException('Stopped', 'AbortError'))
    signal.removeEventListener('abort', stop)
    void context.close().catch(() => {})
  }
  signal.addEventListener('abort', stop, { once: true })
  try {
    if (signal.aborted) throw new DOMException('Stopped', 'AbortError')
    const resumed = context.resume()
    await abortable(authorize(), signal)
    const media = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }, video: false }).then((next) => {
      if (stopped || signal.aborted) { next.getTracks().forEach((track) => track.stop()); throw new DOMException('Stopped', 'AbortError') }
      stream = next
      return next
    })
    // A permission dialog may outlive cancellation; its eventual stream is still disposed above.
    await abortable(Promise.all([media, resumed, context.audioWorklet.addModule(new URL('audio/recorder-worklet.js', document.baseURI).href)]), signal)
    if (stopped || signal.aborted || !stream?.getAudioTracks().length) throw new DOMException('Stopped', 'AbortError')
    recorder = new AudioWorkletNode(context, 'debby-recorder')
    recorder.port.onmessage = (event: MessageEvent<{ samples?: Float32Array; finished?: boolean; limit?: boolean }>) => {
      if (stopped) { event.data.samples?.fill(0); return }
      if (event.data.limit) { rejectFlush?.(new Error('录音达到 30 秒限制，请重新录制。')); stop(); return }
      const samples = event.data.samples
      if (samples) {
        count += samples.length
        if (count > context.sampleRate * voiceLimits.captureSeconds) { samples.fill(0); stop(); return }
        blocks.push(samples)
        if (!finishing) onLevel(Math.min(1, Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) * 5))
      }
      if (event.data.finished) completeFlush?.()
    }
    recorder.onprocessorerror = stop
    const mute = context.createGain(); mute.gain.value = 0
    context.createMediaStreamSource(stream).connect(recorder)
    recorder.connect(mute).connect(context.destination)
    return { stop, finish: async () => {
      if (stopped || finishing) throw new Error('录音已结束。')
      finishing = true
      try {
        const flushed = new Promise<void>((resolve, reject) => { completeFlush = resolve; rejectFlush = reject })
        recorder!.port.postMessage('finish')
        await abortable(flushed, AbortSignal.any([signal, AbortSignal.timeout(1500)]))
        stream?.getTracks().forEach((track) => track.stop())
        if (count < context.sampleRate / 10) throw new Error('录音太短，请再说一次。')
        const merged = new Float32Array(count)
        let offset = 0
        for (const block of blocks) { merged.set(block, offset); offset += block.length }
        const buffer = context.createBuffer(1, count, context.sampleRate); buffer.copyToChannel(merged, 0); merged.fill(0)
        // The browser's audio engine performs anti-aliased resampling, not sample dropping.
        const resampler = new OfflineAudioContext(1, Math.floor(count * 16_000 / context.sampleRate), 16_000)
        const source = resampler.createBufferSource(); source.buffer = buffer; source.connect(resampler.destination); source.start()
        const rendered = await abortable(resampler.startRendering(), signal)
        buffer.getChannelData(0).fill(0)
        const result = pcm16Wav(rendered.getChannelData(0)); rendered.getChannelData(0).fill(0)
        if (signal.aborted) { result.fill(0); throw new DOMException('Stopped', 'AbortError') }
        return result
      } finally { stop() }
    } }
  } catch (error) { stop(); throw error }
}

export async function cameraFrame(stream: MediaStream, signal: AbortSignal): Promise<string> {
  const video = document.createElement('video')
  video.muted = true; video.playsInline = true; video.srcObject = stream
  const canvas = document.createElement('canvas')
  try {
    await abortable(video.play(), AbortSignal.any([signal, AbortSignal.timeout(2000)]))
    if (video.readyState < 2) await abortable(new Promise<void>((resolve) => { video.onloadeddata = () => resolve() }), AbortSignal.any([signal, AbortSignal.timeout(2000)]))
    canvas.width = Math.min(video.videoWidth, 480)
    canvas.height = Math.max(1, Math.round(video.videoHeight * canvas.width / video.videoWidth))
    if (!canvas.width || canvas.height > 960) throw new Error('摄像头画面尚未准备好。')
    const context = canvas.getContext('2d')
    if (!context) throw new Error('摄像头画面不可用。')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const jpeg = canvas.toDataURL('image/jpeg', 0.65).split(',')[1]
    if (!jpeg || jpeg.length > voiceLimits.imageChars) throw new Error('照片过大，本轮未发送。')
    return jpeg
  } finally { video.pause(); video.srcObject = null; canvas.width = 0; canvas.height = 0 }
}

export class BrowserVoicePlayback implements VoicePlayback {
  private readonly context = new AudioContext()
  private source?: AudioBufferSourceNode
  private frame = 0
  private generation = 0
  constructor(private readonly onLevel: (level: number) => void, private readonly onEnded: () => void) { void this.context.resume().catch(() => {}) }
  async play(bytes: Uint8Array): Promise<void> {
    this.stop()
    const generation = this.generation
    if (bytes.length > voiceLimits.responseBytes) throw new Error('音频超过大小限制。')
    const buffer = await this.context.decodeAudioData(new Uint8Array(bytes).buffer)
    bytes.fill(0)
    if (generation !== this.generation || this.context.state as string === 'closed') return
    if (buffer.duration > voiceLimits.playbackSeconds) throw new Error('音频超过时长限制。')
    await this.context.resume()
    if (generation !== this.generation || this.context.state as string === 'closed') return
    const source = this.context.createBufferSource(), analyser = this.context.createAnalyser()
    analyser.fftSize = 256; source.buffer = buffer; this.source = source
    source.connect(analyser).connect(this.context.destination)
    const samples = new Float32Array(analyser.fftSize)
    let last = 0
    const animate = (now: number) => {
      if (generation !== this.generation) return
      this.frame = requestAnimationFrame(animate)
      if (now - last < 40) return
      last = now
      analyser.getFloatTimeDomainData(samples)
      this.onLevel(Math.min(1, Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) * 5))
    }
    source.onended = () => {
      if (generation !== this.generation) return
      cancelAnimationFrame(this.frame); this.source = undefined; source.disconnect(); analyser.disconnect()
      this.onLevel(0); this.onEnded()
    }
    source.start(); this.frame = requestAnimationFrame(animate)
  }
  stop(): void {
    this.generation++
    cancelAnimationFrame(this.frame)
    if (this.source) { this.source.onended = null; try { this.source.stop() } catch {} this.source.disconnect(); this.source = undefined }
    this.onLevel(0)
  }
  close(): void { this.stop(); void this.context.close().catch(() => {}) }
}
