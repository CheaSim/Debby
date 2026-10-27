import { Download, Music2, Play, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { danceLimits, validateMotion, type DanceState } from '../../../shared/dance'
import { platformApi } from '../platform-api'
import { MediaPipeVideoBackend, type CaptureProgress, type VideoMotionBackend } from '../motion/video-capture'
import { danceExpressionLabels, danceExpressionStyles, type DanceExpressionStyle } from '../../../shared/avatar-performance'

const backend = new MediaPipeVideoBackend()
const edges = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28]]
const sourceLabel = { builtin: '内置原创', video: '视频学习', import: '导入动作' }
export function DanceStudio({ state, onClose, onPlay, capture = backend }: {
  state: DanceState; onClose: () => void; onPlay: (id: string, speed: number, loop: boolean, expressionStyle: DanceExpressionStyle) => Promise<void>; capture?: VideoMotionBackend
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const controller = useRef<AbortController | undefined>(undefined)
  const mounted = useRef(true)
  const busyRef = useRef(false)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [duration, setDuration] = useState(0)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(0)
  const [mirror, setMirror] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(false)
  const [expressionStyle, setExpressionStyle] = useState<DanceExpressionStyle>('auto')
  const [progress, setProgress] = useState<CaptureProgress>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { mounted.current = true; dialog.current?.showModal(); return () => { mounted.current = false; controller.current?.abort() } }, [])
  useEffect(() => platformApi.onDanceCaptureStop(() => controller.current?.abort()), [])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  const close = (): void => { controller.current?.abort(); onClose() }
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busyRef.current) return
    busyRef.current = true; setError(''); setNotice(''); setBusy(true)
    try { await action() } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '操作失败，请重试。') }
    finally { busyRef.current = false; if (mounted.current) setBusy(false) }
  }
  const chooseVideo = (file?: File): void => {
    if (!file) return
    setError(''); setNotice(''); setProgress(undefined); setDuration(0)
    if (file.size > danceLimits.videoBytes) { setError('视频须小于 256 MB，请先截取舞蹈片段。'); return }
    setName(file.name.replace(/\.[^.]+$/, '').slice(0, 64)); setUrl(URL.createObjectURL(file))
  }
  const learn = (): Promise<void> => run(async () => {
    if (!video.current) return
    const abort = new AbortController(); controller.current = abort
    setProgress({ fraction: 0, image: [], time: start })
    const motion = await capture.capture(video.current, { name: name.trim() || '我的舞蹈', start, end, mirror, signal: abort.signal,
      progress: (value) => { if (mounted.current && !abort.signal.aborted) setProgress(value) } })
    abort.signal.throwIfAborted()
    await platformApi.saveDance({ motion })
    if (mounted.current) setNotice(`学会啦！已保存到动作库 · 全身可见 ${Math.round((motion.quality?.coverage ?? 0) * 100)}%${(motion.quality?.longestGap ?? 0) > .5 ? '。部分遮挡已插值，建议预览检查。' : ''}`)
  })
  const importMotion = (file?: File): Promise<void> => run(async () => {
    if (!file) return
    if (file.size > danceLimits.fileBytes) throw Error('动作文件须小于 16 MB。')
    if (/\.vrma$/i.test(file.name)) await platformApi.saveDance({ name: file.name.replace(/\.vrma$/i, '').slice(0, 64), bytes: new Uint8Array(await file.arrayBuffer()) })
    else {
      const motion = validateMotion(JSON.parse(await file.text()))
      await platformApi.saveDance({ motion: { ...motion, source: 'import' } })
    }
    setNotice('动作已加入，点播放就能跳。')
  })
  const exportMotion = (id: string): Promise<void> => run(async () => {
    const asset = await platformApi.getDanceAsset(id)
    const blob = asset.motion ? new Blob([JSON.stringify(asset.motion)], { type: 'application/json' }) : new Blob([new Uint8Array(asset.bytes!).buffer], { type: 'model/gltf-binary' })
    const link = document.createElement('a'), href = URL.createObjectURL(blob)
    link.href = href; link.download = `${asset.entry.name.replace(/[<>:"/\\|?*]/g, '_')}.${asset.motion ? 'debbydance.json' : 'vrma'}`; link.click()
    setTimeout(() => URL.revokeObjectURL(href), 3000)
  })
  return <dialog ref={dialog} className="preferences-dialog dance-dialog no-drag" aria-labelledby="dance-title" onCancel={e => { e.preventDefault(); close() }}>
    <header className="dialog-heading"><div><small>DEBBY DANCE</small><h2 id="dance-title">陪我跳支舞</h2></div><button className="ghost-icon" title="关闭舞蹈工作室" onClick={close}><X size={18} /></button></header>
    <p className="dance-intro">给我一段舞蹈视频，学成我们的专属动作。</p>
    <div className="dance-upload-row">
      <label className="dance-file-button"><Upload size={15} />选择舞蹈视频<input aria-label="选择舞蹈视频" type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" disabled={busy} onChange={e => { chooseVideo(e.target.files?.[0]); e.target.value = '' }} /></label>
      <label className="dance-file-button secondary">导入动作<input aria-label="导入舞蹈动作" type="file" accept=".vrma,.json" disabled={busy} onChange={e => { void importMotion(e.target.files?.[0]); e.target.value = '' }} /></label>
    </div>
    <p className="dance-note">本机识别，不上传视频。推荐单人、全身清晰、固定机位；一次学习 0.5–60 秒。</p>
    {url && <section className="dance-capture">
      <div className="dance-video"><video ref={video} src={url} muted playsInline controls={!busy} preload="auto" onLoadedMetadata={e => {
        const v = e.currentTarget
        if (!Number.isFinite(v.duration) || v.videoWidth > 3840 || v.videoHeight > 3840) { setError('请使用不超过 4K 的常见 MP4 视频。'); setDuration(0); return }
        setDuration(v.duration); setStart(0); setEnd(Math.min(15, v.duration))
      }} onError={() => { setDuration(0); setError('视频无法解码，请转换为 MP4 / H.264 后重试。') }} />
      {progress && <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="识别骨架">{edges.map(([a, b]) => {
        const p = progress.image[a], q = progress.image[b]
        return p && q && (p.visibility ?? 0) > .45 && (q.visibility ?? 0) > .45 ? <line key={`${a}-${b}`} x1={p.x * 100} y1={p.y * 100} x2={q.x * 100} y2={q.y * 100} /> : null
      })}</svg>}</div>
      <label className="dance-name">动作名称<input aria-label="舞蹈名称" value={name} maxLength={64} disabled={busy} onChange={e => setName(e.target.value)} /></label>
      <div className="dance-trim"><label>开始 / 秒<input aria-label="舞蹈开始秒数" type="number" min={0} max={duration} step={.1} value={start} disabled={busy} onChange={e => setStart(Number(e.target.value))} /></label><label>结束 / 秒<input aria-label="舞蹈结束秒数" type="number" min={0} max={duration} step={.1} value={end} disabled={busy} onChange={e => setEnd(Number(e.target.value))} /></label><label className="dance-mirror"><input type="checkbox" checked={mirror} disabled={busy} onChange={e => setMirror(e.target.checked)} />镜像动作</label></div>
      <div className="dance-learn-row"><button className="dance-primary" disabled={busy || !duration || end - start < .5 || end - start > 60 || start < 0 || end > duration} onClick={() => void learn()}><Music2 size={15} />{busy ? '正在学习…' : '开始学习'}</button>{busy && <button onClick={() => controller.current?.abort()}>取消学习</button>}{progress && <span role="status">{Math.round(progress.fraction * 100)}%</span>}</div>
      {busy && <progress aria-label="舞蹈学习进度" max={1} value={progress?.fraction ?? 0} />}
    </section>}
    {error && <p className="provider-error" role="alert">{error}</p>}
    {notice && <p className="dance-success" role="status">{notice}</p>}
    <div className="dance-performance-choice"><label>舞台表情<select aria-label="舞台表情风格" value={expressionStyle} onChange={e => setExpressionStyle(e.target.value as DanceExpressionStyle)}>{danceExpressionStyles.map(style => <option key={style} value={style}>{danceExpressionLabels[style]}</option>)}</select></label><p>身体按舞步，脸跟着对话。没有对话时按所选风格演出。</p></div>
    <section className="dance-library"><header><h3>我们的动作库 <small>{state.library.length}</small></h3><div><select aria-label="舞蹈播放速度" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[.5, .75, 1, 1.25, 1.5].map(v => <option key={v} value={v}>{v}×</option>)}</select><label><input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} />循环</label></div></header>
      {state.library.map(entry => <div className="dance-entry" key={entry.id} data-dance-entry={entry.id}><Music2 size={18} /><div><strong>{entry.name}</strong><small>{sourceLabel[entry.source]} · {entry.duration.toFixed(1)} 秒{entry.quality ? ` · 可见 ${Math.round(entry.quality.coverage * 100)}%` : ''}</small></div><button className="icon-button" disabled={busy} title={`播放 ${entry.name}`} onClick={() => void run(() => onPlay(entry.id, speed, loop, expressionStyle))}><Play size={16} /></button><button className="icon-button" disabled={busy} title={`导出 ${entry.name}`} onClick={() => void exportMotion(entry.id)}><Download size={15} /></button>{entry.source !== 'builtin' && <button className="icon-button" disabled={busy} title={`移除 ${entry.name}`} onClick={() => void run(async () => { await platformApi.removeDance(entry.id); setNotice('已移出动作库，原动作文件保留在本机，可恢复。') })}><Trash2 size={14} /></button>}</div>)}
    </section>
    <p className="dance-note">也支持标准 VRMA。单段视频会有深度和遮挡误差，复杂转身、地板动作建议导入精修动作。</p>
  </dialog>
}
