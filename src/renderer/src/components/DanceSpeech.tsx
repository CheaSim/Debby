import { Pause, Play, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import { dancePosition, type DanceCommand, type DanceEntry, type DancePlayback } from '../../../shared/dance'

export function DanceSpeech({ entry, playback, onControl }: { entry: DanceEntry; playback: DancePlayback; onControl: (command: DanceCommand) => Promise<void> }): React.JSX.Element {
  const [now, setNow] = useState(Date.now)
  const [error, setError] = useState('')
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer) }, [])
  const run = (command: DanceCommand): void => { setError(''); void onControl(command).catch(() => setError('操作失败，请重试。')) }
  return <>
    <span className="speech-kicker"><span>和 Debby 一起跳</span><span>{playback.status === 'paused' ? '已暂停' : playback.loop ? '循环中' : '播放中'}</span></span>
    <strong>{entry.name}</strong>
    <div className="dance-transport"><button className="icon-button" title={playback.status === 'paused' ? '继续跳舞' : '暂停跳舞'} onClick={() => run({ action: playback.status === 'paused' ? 'resume' : 'pause' })}>{playback.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}</button><input aria-label="舞蹈播放进度" type="range" min={0} max={entry.duration} step={.05} value={dancePosition(playback, entry.duration, now)} onInput={e => run({ action: 'seek', time: e.currentTarget.valueAsNumber })} /><button className="icon-button" title="停止跳舞" onClick={() => run({ action: 'stop' })}><Square size={14} /></button></div>
    {error && <small role="alert">{error}</small>}
  </>
}
