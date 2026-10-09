import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyVoiceState, voiceLimits, type VoiceApi, type VoiceConfigInput, type VoiceState } from '../../../shared/voice'
import { platformApi } from '../platform-api'
import { BrowserVoicePlayback, cameraFrame, openVoiceCapture, type VoiceCapture } from '../media/voice'

export function useVoiceCompanion(enabled: boolean, api: VoiceApi = platformApi) {
  const [state, setState] = useState(emptyVoiceState)
  const [error, setError] = useState<string>()
  const [recording, setRecording] = useState<'off' | 'starting' | 'on' | 'finishing'>('off')
  const [speaking, setSpeaking] = useState(false)
  const [mouth, setMouth] = useState(0)
  const [inputLevel, setInputLevel] = useState(0)
  const [camera, setCamera] = useState<MediaStream>()
  const stateRef = useRef(state), cameraRef = useRef<MediaStream>(undefined), capture = useRef<VoiceCapture>(undefined)
  const captureAbort = useRef<AbortController>(undefined), frameAbort = useRef<AbortController>(undefined), cameraAbort = useRef<AbortController>(undefined)
  const playback = useRef<BrowserVoicePlayback>(undefined), captureTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const finishing = useRef(false)
  const mounted = useRef(true), enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const act = useCallback(async (action: () => Promise<unknown>) => {
    setError(undefined)
    try { await action(); return true } catch (failure) {
      const message = failure instanceof Error ? failure.message : ''
      if (!/AbortError|Stopped|aborted/i.test(message)) setError(message.replace(/^Error invoking remote method '[^']+': Error: /, '') || '陪伴服务不可用。')
      return false
    }
  }, [])
  const stopRecording = useCallback(() => {
    clearTimeout(captureTimer.current)
    captureAbort.current?.abort(); captureAbort.current = undefined
    capture.current?.stop(); capture.current = undefined
    void api.releaseVoiceMedia('audio').catch(() => {})
    finishing.current = false
    setRecording('off'); setInputLevel(0)
  }, [api])
  const stopCamera = useCallback(() => {
    cameraAbort.current?.abort(); cameraAbort.current = undefined
    cameraRef.current?.getTracks().forEach((track) => track.stop()); cameraRef.current = undefined
    void api.releaseVoiceMedia('video').catch(() => {})
    setCamera(undefined)
  }, [api])
  const stopPlayback = useCallback(() => { playback.current?.stop(); setSpeaking(false); setMouth(0) }, [])
  const disposeMedia = useCallback(() => {
    stopRecording(); stopCamera(); stopPlayback(); frameAbort.current?.abort()
    playback.current?.close(); playback.current = undefined
  }, [stopRecording, stopCamera, stopPlayback])
  const accept = useCallback((next: VoiceState) => {
    if (next.revision < stateRef.current.revision) return
    const previous = stateRef.current
    stateRef.current = next
    if (!next.active || next.sessionId !== previous.sessionId) disposeMedia()
    else if (!next.turnId && previous.turnId) stopPlayback()
    if (mounted.current) setState(next)
  }, [disposeMedia, stopPlayback])
  useEffect(() => {
    mounted.current = true
    const removeState = api.onVoiceState(accept)
    const removeAudio = api.onVoiceAudio((audio) => {
      const current = stateRef.current
      if (!enabledRef.current || !current.active || audio.sessionId !== current.sessionId || audio.turnId !== current.turnId || !playback.current) { audio.bytes.fill(0); return }
      setSpeaking(true)
      void playback.current.play(audio.bytes).catch(() => { if (mounted.current) { setSpeaking(false); setMouth(0); setError('音频播放失败，文字回复已保留。') } })
    })
    void api.getVoiceState().then(accept).catch(() => setError('无法连接陪伴服务。'))
    const leave = () => { disposeMedia(); void api.stopVoice().catch(() => {}) }
    const visibility = () => { if (document.hidden) leave() }
    window.addEventListener('pagehide', leave); window.addEventListener('beforeunload', leave); document.addEventListener('visibilitychange', visibility)
    return () => { mounted.current = false; removeState(); removeAudio(); disposeMedia(); void api.stopVoice().catch(() => {}); window.removeEventListener('pagehide', leave); window.removeEventListener('beforeunload', leave); document.removeEventListener('visibilitychange', visibility) }
  }, [api, accept, disposeMedia])
  useEffect(() => { if (!enabled) { disposeMedia(); if (stateRef.current.active) void api.stopVoice().catch(() => {}) } }, [enabled, api, disposeMedia])
  const startCamera = async (): Promise<void> => {
    if (cameraRef.current) return
    if (!stateRef.current.active || !stateRef.current.cameraAllowed) throw new Error('本次会话尚未授权摄像头。')
    cameraAbort.current?.abort()
    const controller = new AbortController(); cameraAbort.current = controller
    const sessionId = stateRef.current.sessionId
    await api.authorizeVoiceMedia('video')
    if (controller.signal.aborted || !enabledRef.current) return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 480 }, height: { ideal: 360 }, facingMode: 'user' } })
    if (controller.signal.aborted || !stateRef.current.active || sessionId !== stateRef.current.sessionId || !enabledRef.current) { stream.getTracks().forEach((track) => track.stop()); return }
    cameraRef.current = stream; setCamera(stream)
    stream.getVideoTracks().forEach((track) => track.addEventListener('ended', () => { stopCamera(); setError('摄像头已断开；可继续语音或文字陪伴。') }, { once: true }))
  }
  const start = async (useCamera: boolean): Promise<boolean> => act(async () => {
    const next = await api.startVoice({ cloudConsent: true, camera: useCamera })
    accept(next)
    if (!enabledRef.current) { await api.stopVoice(); return }
    playback.current = new BrowserVoicePlayback(setMouth, () => setSpeaking(false))
    if (useCamera) {
      try { await startCamera() } catch { stopCamera(); setError('摄像头不可用；可以继续语音或文字陪伴。') }
    }
  })
  const interrupt = async (): Promise<boolean> => { stopRecording(); stopPlayback(); frameAbort.current?.abort(); return act(api.interruptVoice) }
  const send = async (text: string): Promise<boolean> => act(async () => {
    if (finishing.current) throw new Error('正在提交语音，请稍候。')
    if (!stateRef.current.active || !enabledRef.current) throw new Error('请先开启陪伴会话。')
    stopPlayback()
    const controller = new AbortController(); frameAbort.current = controller
    const sessionId = stateRef.current.sessionId!
    const image = cameraRef.current ? await cameraFrame(cameraRef.current, controller.signal) : undefined
    if (controller.signal.aborted || !enabledRef.current) return
    await api.sendVoiceTurn({ sessionId, text, image })
  })
  const toggleRecording = async (): Promise<boolean> => act(async () => {
    if (finishing.current) return
    if (recording === 'starting') { stopRecording(); return }
    if (capture.current) {
      const current = capture.current, controller = captureAbort.current!
      const sessionId = stateRef.current.sessionId!
      capture.current = undefined; clearTimeout(captureTimer.current); finishing.current = true; setRecording('finishing'); setInputLevel(0)
      let audio: Uint8Array | undefined
      try {
        audio = await current.finish()
        await api.releaseVoiceMedia('audio')
        const image = cameraRef.current ? await cameraFrame(cameraRef.current, controller.signal) : undefined
        if (!controller.signal.aborted && enabledRef.current) await api.sendVoiceTurn({ sessionId, audio, image })
      } finally { audio?.fill(0); controller.abort(); if (captureAbort.current === controller) { captureAbort.current = undefined; finishing.current = false; setRecording('off') } }
      return
    }
    if (!stateRef.current.active || !enabledRef.current) throw new Error('请先开启陪伴会话。')
    await api.interruptVoice(); stopPlayback()
    const controller = new AbortController(); captureAbort.current = controller
    const sessionId = stateRef.current.sessionId
    setRecording('starting')
    captureTimer.current = setTimeout(() => { stopRecording(); setError('录音达到时间限制，已丢弃，未上传。') }, voiceLimits.captureSeconds * 1000)
    try {
      const opened = await openVoiceCapture(controller.signal, () => api.authorizeVoiceMedia('audio'), setInputLevel)
      if (controller.signal.aborted || sessionId !== stateRef.current.sessionId || !enabledRef.current) { opened.stop(); return }
      capture.current = opened; setRecording('on')
    } catch (failure) { stopRecording(); throw failure }
  })
  return { state, error: error ?? state.error ?? state.chat.error, recording, speaking, mouth, inputLevel, camera,
    busy: ['transcribing', 'thinking', 'synthesizing'].includes(state.phase),
    start, send, interrupt, toggleRecording,
    stop: async () => { disposeMedia(); await act(api.stopVoice) },
    toggleCamera: () => act(async () => { if (cameraRef.current) stopCamera(); else await startCamera() }),
    clear: async () => { stopRecording(); stopPlayback(); frameAbort.current?.abort(); await act(api.clearVoice) },
    configure: (input: VoiceConfigInput) => act(async () => accept(await api.configureVoice(input))) }
}
export type VoiceCompanionController = ReturnType<typeof useVoiceCompanion>
