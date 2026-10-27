import { Check, Heart, ImagePlus, Layers3, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { LayeredAvatarAsset } from '../../../shared/layered-avatar'
import type { useLayeredAvatar } from '../hooks/use-layered-avatar'
import { LayeredPet } from './LayeredPet'

export function AvatarStudio({ avatar, onClose }: { avatar: ReturnType<typeof useLayeredAvatar>; onClose: () => void }): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null), controller = useRef<AbortController | undefined>(undefined), alive = useRef(true)
  const [draft, setDraft] = useState(avatar.asset), [busy, setBusy] = useState(false), [progress, setProgress] = useState('')
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [ready, setReady] = useState(false)
  const [portrait, setPortrait] = useState(true), [talking, setTalking] = useState(false), [cue, setCue] = useState<{ id: number; name: 'heart' }>()
  const [mouth, setMouth] = useState(0)
  useEffect(() => { alive.current = true; dialog.current?.showModal(); return () => { alive.current = false; controller.current?.abort() } }, [])
  useEffect(() => { if (!draft && avatar.asset) setDraft(avatar.asset) }, [avatar.asset])
  useEffect(() => {
    if (!talking) { setMouth(0); return }
    const timer = setInterval(() => setMouth(.15 + .7 * Math.abs(Math.sin(performance.now() / 170))), 50)
    return () => clearInterval(timer)
  }, [talking])
  const close = (): void => { controller.current?.abort(); onClose() }
  const choose = async (file?: File): Promise<void> => {
    if (!file || busy || avatar.loading) return
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort
    setBusy(true); setError(''); setNotice(''); setProgress('正在读取 PSD…')
    try {
      if (!/\.psd$/i.test(file.name)) throw Error('请选择 .psd 分层角色文件。')
      const rig = await avatar.backend.parse(file, { signal: abort.signal, progress: text => { if (alive.current) setProgress(text) } })
      abort.signal.throwIfAborted()
      if (alive.current) { setReady(false); setDraft({ name: file.name.replace(/\.psd$/i, '').slice(0, 80), file, rig }) }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '导入失败。') }
    finally { if (alive.current) { setBusy(false); setProgress('') } }
  }
  const run = async (operation: () => Promise<void>, message: string): Promise<void> => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await operation(); if (alive.current) setNotice(message) }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '保存失败，请重试。') }
    finally { if (alive.current) setBusy(false) }
  }
  const change = (asset: LayeredAvatarAsset): Promise<void> => run(() => avatar.use(asset), '已换上新角色，关闭工坊就能陪你啦。')
  return <dialog ref={dialog} className="preferences-dialog avatar-studio no-drag" aria-labelledby="avatar-studio-title" onCancel={e => { e.preventDefault(); close() }}>
    <header className="dialog-heading"><div><small>DEBBY ATELIER</small><h2 id="avatar-studio-title">让你的角色，陪在身边</h2></div><button className="ghost-icon" title="关闭角色工坊" onClick={close}><X size={18} /></button></header>
    <p className="avatar-studio-intro">一张喜欢的立绘，也可以拥有呼吸、目光和表情。</p>
    <div className="avatar-studio-layout">
      <div className="avatar-preview">
        {draft ? <LayeredPet asset={draft} portrait={portrait} mouthLevel={mouth} cue={cue} onReady={() => setReady(true)} onError={message => { setReady(false); setError(message) }} /> : <div className="avatar-empty"><Sparkles size={34} /><strong>在这里，遇见新的 Debby</strong><span>导入分层 PSD，即可预览</span></div>}
        <span className="avatar-preview-badge">{draft ? '2.5D · 本地预览' : '你的专属角色'}</span>
      </div>
      <div className="avatar-studio-controls">
        <label className="avatar-import"><ImagePlus size={20} /><strong>{draft ? '换一张立绘' : '导入角色 PSD'}</strong><span>RGB / 8 bit · 最大 64 MB</span><input type="file" accept=".psd" aria-label="导入角色 PSD" disabled={busy || avatar.loading} onChange={e => { void choose(e.target.files?.[0]); e.target.value = '' }} /></label>
        {draft && <><div className="avatar-model-info"><Layers3 size={15} /><strong>{draft.name}</strong><span>{draft.rig.layers.length} 个部件</span></div>
          <div className="avatar-preview-controls" role="group" aria-label="预览角色效果">
            <button disabled={!ready || busy} aria-pressed={portrait} onClick={() => setPortrait(!portrait)}>{portrait ? '查看全身' : '查看上半身'}</button>
            <button disabled={!ready || busy} aria-pressed={talking} onClick={() => setTalking(!talking)}>{talking ? '停止试口型' : '试试口型'}</button>
            <button disabled={!ready || busy} onClick={() => setCue({ id: Date.now(), name: 'heart' })}><Heart size={13} />小心意</button>
          </div>
          {(draft.rig.synth.eye || draft.rig.synth.mouth) && <p className="avatar-small-note">已补上通用闭眼或闭口差分，可在 PSD 中绘制专属差分以提升效果。</p>}
          <p className="avatar-small-note">2.5D 支持目光、表情与口型。播放骨骼舞蹈时会暂时使用 3D 角色。</p>
          <button className="primary-button avatar-apply" disabled={!ready || busy || avatar.loading} onClick={() => void change(draft)}><Check size={15} />用这个角色陪我</button>
        </>}
        <details className="avatar-authoring"><summary>只有一张插画？</summary><p>用 See-through 将插画拆为分层 PSD，再回来导入。已有分层 PSD 可以直接使用。</p><p>生成流程需要单独准备 GPU 推理环境，具体步骤见项目的角色接入文档。</p></details>
        <div className="avatar-library-actions"><button disabled={busy || avatar.loading} onClick={() => void run(avatar.use3d, '已切回 3D，保存的立绘仍然保留。')}>使用原来的 3D</button>{avatar.asset && <button title="移除保存的立绘" disabled={busy} onClick={() => void run(async () => { await avatar.remove(); setDraft(undefined); setReady(false) }, '已移除本机保存的立绘。')}><Trash2 size={14} /></button>}</div>
      </div>
    </div>
    {(busy || avatar.loading) && <p className="avatar-status" role="status">{avatar.loading ? '恢复上次的角色…' : progress || '正在保存…'}{progress && <button onClick={() => controller.current?.abort()}>取消导入</button>}</p>}
    {(error || avatar.error) && <p className="avatar-status error" role="alert">{error || avatar.error}</p>}
    {notice && <p className="avatar-status success" role="status">{notice}</p>}
    <footer className="avatar-studio-footer">立绘保存在本机 · 导入与预览不使用摄像头或麦克风</footer>
  </dialog>
}
