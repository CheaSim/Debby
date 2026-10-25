import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyDanceState, type DanceAsset, type DanceCommand, type DanceState } from '../../../shared/dance'
import { platformApi } from '../platform-api'

export function useDancePlayer() {
  const [state, setState] = useState(emptyDanceState)
  const [asset, setAsset] = useState<DanceAsset>()
  const [error, setError] = useState('')
  const revision = useRef(-1)
  useEffect(() => {
    let alive = true
    const receive = (next: DanceState): void => { if (alive && next.revision >= revision.current) { revision.current = next.revision; setState(next) } }
    const off = platformApi.onDanceState(receive)
    void platformApi.getDanceState().then(receive).catch(() => setError('动作库暂时无法打开。'))
    return () => { alive = false; off() }
  }, [])
  const id = state.playback?.id
  useEffect(() => {
    let alive = true
    setAsset(undefined)
    if (id) void platformApi.getDanceAsset(id).then(value => { if (alive) { setAsset(value); setError('') } }).catch(() => {
      if (alive) { setError('这支动作无法播放，请重新导入。'); void platformApi.controlDance({ action: 'stop' }) }
    })
    return () => { alive = false }
  }, [id])
  const control = useCallback(async (command: DanceCommand): Promise<void> => {
    try { setError(''); await platformApi.controlDance(command) }
    catch (e) { setError(e instanceof Error ? e.message : '舞蹈操作失败。'); throw e }
  }, [])
  return { state, asset: asset?.entry.id === id ? asset : undefined, error, control }
}
