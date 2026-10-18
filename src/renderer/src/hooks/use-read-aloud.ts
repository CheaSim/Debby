import { useCallback, useEffect, useRef, useState } from 'react'
import type { VoiceApi } from '../../../shared/voice'
import { BrowserVoicePlayback } from '../media/voice'
import { platformApi } from '../platform-api'

/** Speech output only: usable with any text agent, without a microphone or companion session. */
export function useReadAloud(enabled: boolean, api: Pick<VoiceApi, 'readAloud' | 'cancelReadAloud' | 'onReadAloudStop'> = platformApi) {
  const [loading, setLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [mouth, setMouth] = useState(0)
  const [error, setError] = useState<string>()
  const playback = useRef<BrowserVoicePlayback>(undefined)
  const generation = useRef(0), mounted = useRef(true), enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const stop = useCallback(() => {
    generation.current++
    playback.current?.close(); playback.current = undefined
    void api.cancelReadAloud().catch(() => {})
    if (mounted.current) { setLoading(false); setSpeaking(false); setMouth(0) }
  }, [api])
  // Called from the user's speaker-button gesture so the audio engine is ready for later replies.
  const prepare = useCallback((): boolean => {
    if (!enabledRef.current) return false
    try {
      playback.current ??= new BrowserVoicePlayback(setMouth, () => { if (mounted.current) setSpeaking(false) })
      setError(undefined)
      return true
    } catch { setError('音频输出不可用，文字回复已保留。'); return false }
  }, [])
  const read = useCallback(async (text: string): Promise<boolean> => {
    if (!enabledRef.current || !prepare()) return false
    const current = ++generation.current
    const requestId = crypto.randomUUID()
    const player = playback.current!
    player.stop(); setSpeaking(false); setLoading(true); setError(undefined)
    let bytes: Uint8Array | undefined
    try {
      const audio = await api.readAloud({ requestId, text, cloudConsent: true })
      bytes = audio.bytes
      if (!mounted.current || !enabledRef.current || current !== generation.current || audio.requestId !== requestId) return false
      setLoading(false); setSpeaking(true)
      await player.play(bytes)
      return current === generation.current
    } catch (failure) {
      if (mounted.current && current === generation.current) {
        setLoading(false); setSpeaking(false); setMouth(0)
        setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '朗读失败，文字回复已保留。')
      }
      return false
    } finally { bytes?.fill(0) }
  }, [api, prepare])
  useEffect(() => {
    mounted.current = true
    const unsubscribe = api.onReadAloudStop(stop)
    const visibility = () => { if (document.hidden) stop() }
    window.addEventListener('pagehide', stop); document.addEventListener('visibilitychange', visibility)
    return () => { mounted.current = false; unsubscribe(); stop(); window.removeEventListener('pagehide', stop); document.removeEventListener('visibilitychange', visibility) }
  }, [api, stop])
  useEffect(() => { if (!enabled) stop() }, [enabled, stop])
  return { loading, speaking, mouth, error, prepare, read, stop }
}
export type ReadAloudController = ReturnType<typeof useReadAloud>
