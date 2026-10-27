import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpeechMark, VoiceApi } from '../../../shared/voice'
import { BrowserSpeechPlayback } from '../media/speech-playback'
import { platformApi } from '../platform-api'

/** Cumulative text from any agent -> speech, without a microphone or companion session. */
export function useReadAloud(enabled: boolean, api: Pick<VoiceApi, 'streamReadAloud' | 'onReadAloudAudio' | 'cancelReadAloud' | 'onReadAloudStop'> = platformApi) {
  const [loading, setLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [mouth, setMouth] = useState(0)
  const [cursor, setCursor] = useState<SpeechMark>()
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string>()
  const playback = useRef<BrowserSpeechPlayback>(undefined)
  const source = useRef<{ turn: string; requestId: string; lineId?: string; text?: string; done?: boolean; sequence: number }>(undefined)
  const blocked = useRef<string>(undefined), mounted = useRef(true), enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const stop = useCallback(() => {
    blocked.current = source.current?.turn ?? blocked.current
    source.current = undefined
    playback.current?.close(); playback.current = undefined
    void api.cancelReadAloud().catch(() => {})
    if (mounted.current) { setLoading(false); setSpeaking(false); setMouth(0); setCursor(undefined); setArmed(false) }
  }, [api])
  // Called from the user's speaker-button gesture so the audio engine is ready for later replies.
  const prepare = useCallback((): boolean => {
    if (!enabledRef.current) return false
    try {
      playback.current ??= new BrowserSpeechPlayback(setMouth, (value) => { if (mounted.current) setSpeaking(value) }, mark => { if (mounted.current) setCursor(mark) })
      setArmed(true)
      setError(undefined); blocked.current = undefined
      return true
    } catch { setError('音频输出不可用，文字回复已保留。'); return false }
  }, [])
  const update = useCallback(async (turn: string, lineId: string, text: string, done: boolean): Promise<void> => {
    if (!enabledRef.current || blocked.current === turn) return
    if (source.current?.turn !== turn) {
      stop()
      if (!prepare()) return
      source.current = { turn, requestId: crypto.randomUUID(), sequence: 0 }
      setLoading(true)
    }
    const current = source.current!
    if (current.lineId === lineId && current.text === text && current.done === done) return
    current.lineId = lineId; current.text = text; current.done = done
    try { await api.streamReadAloud({ requestId: current.requestId, lineId, text, done, cloudConsent: true }) }
    catch (failure) {
      if (mounted.current && source.current === current) {
        stop(); setError(failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : '朗读失败，文字回复已保留。')
      }
    }
  }, [api, prepare, stop])
  useEffect(() => {
    mounted.current = true
    const unsubscribe = api.onReadAloudStop(stop)
    const removeAudio = api.onReadAloudAudio((event) => {
      const current = source.current, player = playback.current
      if (!enabledRef.current || !current || !player || event.requestId !== current.requestId || event.sequence !== current.sequence) { event.bytes.fill(0); return }
      current.sequence++
      if (event.error) { stop(); setError(event.error); return }
      if (event.done) { setLoading(false); return }
      setLoading(false)
      void player.enqueue(event).catch(() => { if (mounted.current && source.current === current) { stop(); setError('音频播放失败，文字回复已保留。') } })
    })
    const visibility = () => { if (document.hidden) stop() }
    window.addEventListener('pagehide', stop); document.addEventListener('visibilitychange', visibility)
    return () => { mounted.current = false; unsubscribe(); removeAudio(); stop(); window.removeEventListener('pagehide', stop); document.removeEventListener('visibilitychange', visibility) }
  }, [api, stop])
  useEffect(() => { if (!enabled) stop() }, [enabled, stop])
  return { loading, speaking, mouth, cursor, armed, error, prepare, update, stop }
}
export type ReadAloudController = ReturnType<typeof useReadAloud>
