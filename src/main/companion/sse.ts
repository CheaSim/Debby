/** Bounded SSE framing, including CRLF, multiline data and split UTF-8/network chunks. */
export async function* sseData(response: Response, signal: AbortSignal): AsyncGenerator<string> {
  if (!response.body) throw new Error('服务返回了空响应。')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let pending = '', data: string[] = [], eventSize = 0, total = 0
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      if (signal.aborted) throw new DOMException('Stopped', 'AbortError')
      const { value, done } = await reader.read()
      if (signal.aborted) throw new DOMException('Stopped', 'AbortError')
      total += value?.byteLength ?? 0
      if (total > 16_000_000) throw new Error('音频流超过大小限制。')
      pending += done ? decoder.decode() + '\n\n' : decoder.decode(value, { stream: true })
      let at: number
      while ((at = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, at).replace(/\r$/, ''); pending = pending.slice(at + 1)
        if (line.startsWith('data:')) {
          const part = line.slice(5).replace(/^ /, '')
          eventSize += part.length
          if (eventSize > 1_000_000) throw new Error('音频事件超过大小限制。')
          data.push(part)
        } else if (!line && data.length) {
          yield data.join('\n')
          data = []; eventSize = 0
        }
      }
      if (pending.length > 1_000_000) throw new Error('音频事件超过大小限制。')
      if (done) break
    }
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock() }
}
