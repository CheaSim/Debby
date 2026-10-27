import { useEffect, useRef, useState } from 'react'
import type { ChatState } from '../../../shared/chat'
import { conversationExpression, type AvatarPerformance } from '../../../shared/avatar-performance'
import type { SpeechMark } from '../../../shared/voice'

/** No model call: consumes the current reply's typed cues and actual audio playback cursor. */
export function useAvatarPerformance(chat: ChatState, audioExpected: boolean, cursor?: SpeechMark) {
  const [performance, setPerformance] = useState<AvatarPerformance>()
  const seen = useRef(new Set<string>())
  const active = useRef<AvatarPerformance | undefined>(undefined)
  const audioMode = useRef(audioExpected)
  const next = conversationExpression(chat, audioExpected, cursor)
  const key = next?.id
  useEffect(() => {
    const stoppedAudio = audioMode.current && !audioExpected
    audioMode.current = audioExpected
    if (stoppedAudio) {
      if (next) seen.current.add(next.id)
      active.current = undefined; setPerformance(undefined); return
    }
    if (!next) { active.current = undefined; setPerformance(undefined); return }
    if (seen.current.has(next.id) && active.current?.id !== next.id) { setPerformance(undefined); return }
    seen.current.add(next.id)
    if (seen.current.size > 64) seen.current.delete(seen.current.values().next().value!)
    const lifetime = audioExpected && cursor ? Math.max(6500, Math.min(20000, cursor.textLength * 150)) : 6500
    const value: AvatarPerformance = active.current?.id === next.id ? active.current : { ...next.directive, id: next.id, source: 'conversation', expiresAt: Date.now() + lifetime }
    active.current = value
    setPerformance(value)
    const timer = setTimeout(() => setPerformance(current => current?.id === value.id ? undefined : current), Math.max(0, value.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [key, audioExpected])
  return performance
}
