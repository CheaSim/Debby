class DebbyRecorder extends AudioWorkletProcessor {
  constructor() {
    super()
    this.chunk = new Float32Array(4096)
    this.length = 0
    this.total = 0
    this.finished = false
    this.port.onmessage = (event) => {
      if (event.data === 'finish' && !this.finished) {
        this.flush()
        this.finished = true
        this.port.postMessage({ finished: true })
      }
    }
  }
  flush() {
    if (!this.length) return
    const samples = this.chunk.slice(0, this.length)
    this.port.postMessage({ samples }, [samples.buffer])
    this.chunk.fill(0)
    this.length = 0
  }
  process(inputs) {
    const channel = inputs[0]?.[0]
    if (this.finished || !channel) return true
    for (const sample of channel) {
      if (++this.total > sampleRate * 30) {
        this.finished = true
        this.chunk.fill(0)
        this.port.postMessage({ limit: true })
        return true
      }
      this.chunk[this.length++] = sample
      if (this.length === this.chunk.length) this.flush()
    }
    return true
  }
}
registerProcessor('debby-recorder', DebbyRecorder)
