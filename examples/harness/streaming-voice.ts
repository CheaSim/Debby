import { StreamingSpeech, type SpeechPacket, type SpeechProvider } from '../../src/main/companion'

/** Connect a harness's text deltas to any speech provider; the harness owns its AbortSignal. */
export async function speakHarnessReply(options: {
  deltas: AsyncIterable<string>
  provider: Pick<SpeechProvider, 'synthesize' | 'synthesizeStream'>
  signal: AbortSignal
  onAudio: (packet: SpeechPacket) => void
  onError: (message: string) => void
}): Promise<void> {
  const speech = new StreamingSpeech(options.provider, options.signal, options.onAudio, options.onError)
  let text = ''
  try {
    for await (const delta of options.deltas) {
      if (options.signal.aborted) break
      if (text.length + delta.length > 1200) throw new Error('回复文本过长，朗读已停止。')
      text += delta
      speech.update('harness-reply', text, false)
    }
    if (!options.signal.aborted) {
      speech.update('harness-reply', text, true)
      await speech.waitForIdle()
    }
  } finally { speech.cancel() }
}

// onAudio must synchronously copy bytes before an asynchronous bus / player boundary:
// bus.emit('speech', { ...packet, bytes: new Uint8Array(packet.bytes) })
// The final done:true packet has no audio. Providers and harness streams must obey signal.
