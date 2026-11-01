import { Check, Heart, ImagePlus, Layers3, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { layeredMotionScale, type LayeredAvatarAsset } from '../../../shared/layered-avatar'
import type { useLayeredAvatar } from '../hooks/use-layered-avatar'
import { LayeredPet } from './LayeredPet'
import { avatarEmotions, emotionLabels, type AvatarEmotion } from '../../../shared/avatar-performance'
import { isPortraitRig, isStandRig } from '../../../shared/standrig-avatar'
import { builtinWhalePath } from '../avatar/builtin-avatar'
import { layeredPartLabel } from '../../../shared/layered-parts'
import { expressionPose, isExpressionRig } from '../../../shared/expression-avatar'
import { avatarActionInfo, type AvatarAction } from '../../../shared/avatar'

export function AvatarStudio({ avatar, onClose }: { avatar: ReturnType<typeof useLayeredAvatar>; onClose: () => void }): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null), controller = useRef<AbortController | undefined>(undefined), alive = useRef(true)
  const [draft, setDraft] = useState(avatar.asset), [busy, setBusy] = useState(false), [progress, setProgress] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [ready, setReady] = useState(false)
  const [portrait, setPortrait] = useState(true), [talking, setTalking] = useState(false), [cue, setCue] = useState<{ id: number; name: AvatarAction }>()
  const [mouth, setMouth] = useState(0)
  const [previewEmotion, setPreviewEmotion] = useState<AvatarEmotion>('neutral')
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [hiddenLayers, setHiddenLayers] = useState<number[]>([])
  const [previewPose, setPreviewPose] = useState('')
  const [previewAction, setPreviewAction] = useState<AvatarAction>('greet')
  const poseOnly = Boolean(draft && isPortraitRig(draft.rig))
  const skeleton = draft && isStandRig(draft.rig) ? draft.rig.document.metadata?.debby?.skeleton : undefined
  const expressionRig = draft && isExpressionRig(draft.rig) ? draft.rig : undefined
  const partsRig = expressionRig ? expressionPose(expressionRig, { emotion: previewEmotion, intensity: .8 }, undefined, previewPose).rig : draft?.rig
  useEffect(() => { alive.current = true; dialog.current?.showModal(); return () => { alive.current = false; controller.current?.abort() } }, [])
  useEffect(() => { if (!draft && avatar.asset) setDraft(avatar.asset) }, [avatar.asset])
  useEffect(() => { setHiddenLayers([]); setPreviewPose('') }, [draft?.rig])
  useEffect(() => setHiddenLayers([]), [previewEmotion, previewPose])
  useEffect(() => {
    if (!talking) { setMouth(0); return }
    const timer = setInterval(() => setMouth(.15 + .7 * Math.abs(Math.sin(performance.now() / 170))), 50)
    return () => clearInterval(timer)
  }, [talking])
  const close = (): void => { if (!saving) { controller.current?.abort(); onClose() } }
  const choose = async (file?: File): Promise<void> => {
    if (!file || busy || avatar.loading) return
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort
    setBusy(true); setError(''); setNotice(''); setProgress('正在读取角色…')
    try {
      if (!/\.(psd|srig|debby)$/i.test(file.name)) throw Error('请选择 .psd、.srig 或 .debby 多表情角色包。')
      const rig = await avatar.backend.parse(file, { signal: abort.signal, progress: text => { if (alive.current) setProgress(text) } })
      abort.signal.throwIfAborted()
      if (alive.current) { setReady(false); setDraft({ name: isExpressionRig(rig) ? rig.expressionSet.name : file.name.replace(/\.(psd|srig)$/i, '').slice(0, 80), file, rig }) }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '导入失败。') }
    finally { if (alive.current) { setBusy(false); setProgress('') } }
  }
  const run = async (operation: () => Promise<void>, message: string, persist = true): Promise<void> => {
    if (busy) return
    setBusy(true); setSaving(persist); setError(''); setNotice(''); setProgress('')
    try { await operation(); if (alive.current) setNotice(message) }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : '保存失败，请重试。') }
    finally { if (alive.current) { setBusy(false); setSaving(false); setProgress('') } }
  }
  const change = (asset: LayeredAvatarAsset): Promise<void> => run(() => avatar.use(asset), '已换上新角色，关闭工坊就能陪你啦。')
  const whale = (): Promise<void> => run(async () => {
    setProgress('正在唤醒鲸鱼娘…')
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort
    const response = await fetch(new URL(builtinWhalePath, document.baseURI), { signal: abort.signal })
    if (!response.ok) throw Error('鲸鱼娘角色包加载失败，请重新打开角色工坊。')
    const file = await response.blob(), rig = await avatar.backend.parse(file, { signal: abort.signal, progress: text => { if (alive.current) setProgress(text) } })
    abort.signal.throwIfAborted()
    if (alive.current) { setReady(false); setTalking(false); setPreviewEmotion('neutral'); setDraft({ name: 'Debby · 鲸鱼娘', file, rig }) }
  }, '鲸鱼娘来啦，试试表情，再让她陪你吧。', false)
  return <dialog ref={dialog} className="preferences-dialog avatar-studio no-drag" aria-labelledby="avatar-studio-title" onCancel={e => { e.preventDefault(); close() }}>
    <header className="dialog-heading"><div><small>DEBBY ATELIER</small><h2 id="avatar-studio-title">让你的角色，陪在身边</h2></div><button className="ghost-icon" title="关闭角色工坊" disabled={saving} onClick={close}><X size={18} /></button></header>
    <p className="avatar-studio-intro">一张喜欢的立绘，也可以拥有呼吸、目光和表情。</p>
    <div className="avatar-studio-layout">
      <div className="avatar-preview">
        {draft ? <LayeredPet pose={previewPose || undefined} hiddenLayers={hiddenLayers} showSkeleton={showSkeleton} performance={{ id: 'studio-preview', emotion: previewEmotion, intensity: .8, source: 'preview', expiresAt: Number.MAX_SAFE_INTEGER }} asset={draft} portrait={portrait} mouthLevel={mouth} activity={talking ? 'talking' : undefined} cue={cue} onReady={() => setReady(true)} onError={message => { setReady(false); setError(message) }} /> : <div className="avatar-empty"><Sparkles size={34} /><strong>在这里，遇见新的 Debby</strong><span>导入 PSD 或多表情角色包，即可预览</span></div>}
        <span className="avatar-preview-badge">{draft ? skeleton ? '骨架立绘 · 本地预览' : poseOnly ? '表情立绘 · 本地预览' : '2.5D · 本地预览' : '你的专属角色'}</span>
      </div>
      <div className="avatar-studio-controls">
        <button className="whale-character-card" disabled={busy || avatar.loading} onClick={() => void whale()}><img alt="DeepSeek 蓝白长裙鲸鱼娘" src={new URL('models/whale-girl/cover.webp', document.baseURI).href} /><span><strong>遇见鲸鱼娘</strong><small>DeepSeek 鲸鱼娘 · 随对话变换表情</small></span><Sparkles size={17} /></button>
        <details className="avatar-authoring"><summary>导入自己的角色 · PSD / StandRig</summary><label className="avatar-import"><ImagePlus size={20} /><strong>导入角色</strong><span>PSD / .srig / 多表情 .debby · 最大 64 MB</span><input type="file" accept=".psd,.srig,.debby" aria-label="导入角色 PSD" disabled={busy || avatar.loading} onChange={e => { void choose(e.target.files?.[0]); e.target.value = '' }} /></label></details>
        {draft && <><div className="avatar-model-info"><Layers3 size={15} /><strong>{draft.name}</strong><span>{expressionRig ? `${expressionRig.expressionSet.poses.length} 张分层立绘` : skeleton ? `${skeleton.jointIds.length} 个关节` : poseOnly && isStandRig(draft.rig) ? `${draft.rig.document.assets.length} 张立绘` : `${draft.rig.layers.length} 个部件`}</span></div>
          <div className="avatar-preview-controls" role="group" aria-label="预览角色效果">
            <button disabled={!ready || busy} aria-pressed={portrait} onClick={() => setPortrait(!portrait)}>{portrait ? '查看全身' : '查看上半身'}</button>
            {!poseOnly && <button disabled={!ready || busy} aria-pressed={talking} onClick={() => setTalking(!talking)}>{talking ? '停止试口型' : '试试口型'}</button>}
            {poseOnly && <button disabled={!ready || busy} aria-pressed={talking} onClick={() => setTalking(!talking)}>{talking ? '停止试动作' : '试试说话动作'}</button>}
            {skeleton && <button disabled={!ready || busy} aria-pressed={showSkeleton} onClick={() => setShowSkeleton(!showSkeleton)}>{showSkeleton ? '隐藏骨架' : '显示骨架'}</button>}
            {!poseOnly && <button disabled={!ready || busy} onClick={() => setCue({ id: Date.now(), name: 'heart' })}><Heart size={13} />小心意</button>}
          </div>
          <label className="avatar-expression-select">试试表情<select aria-label="预览表情" value={previewEmotion} disabled={!ready || busy} onChange={e => setPreviewEmotion(e.target.value as AvatarEmotion)}>{avatarEmotions.map(emotion => <option key={emotion} value={emotion}>{emotionLabels[emotion]}</option>)}</select></label>
          {expressionRig && <label className="avatar-expression-select">表情立绘<select aria-label="预览立绘" value={previewPose} disabled={!ready || busy} onChange={e => setPreviewPose(e.target.value)}><option value="">随表情自动切换</option>{expressionRig.expressionSet.poses.map(pose => <option value={pose.id} key={pose.id}>{pose.label}</option>)}</select></label>}
          <details className="avatar-authoring avatar-motion-settings"><summary>动作与幅度</summary><label className="avatar-motion-range">轻柔<input aria-label="动作幅度" type="range" min="0.6" max="2.4" step="0.1" value={layeredMotionScale(draft.motionScale)} disabled={!ready || busy} onChange={e => setDraft({ ...draft, motionScale: Number(e.target.value) })} />活泼<output>{layeredMotionScale(draft.motionScale).toFixed(1)}×</output></label><div className="avatar-preview-controls"><select aria-label="预览动作" value={previewAction} onChange={e => setPreviewAction(e.target.value as AvatarAction)}>{(['greet', 'nod', 'shake', 'heart', 'shy', 'stretch', 'bow', 'clap'] as const).map(action => <option key={action} value={action}>{avatarActionInfo[action].label}</option>)}</select><button disabled={!ready || busy} onClick={() => setCue({ id: Date.now(), name: previewAction })}>播放动作</button></div></details>
          {!isStandRig(draft.rig) && <details className="avatar-authoring avatar-parts"><summary>查看拆分图层</summary><p>勾选部件查看遮挡关系，只影响这里的预览。</p><div className="avatar-part-list">{partsRig!.layers.map(layer => <label key={`${partsRig!.layers.length}:${layer.z}`}><input type="checkbox" checked={!hiddenLayers.includes(layer.z)} onChange={e => setHiddenLayers(hidden => e.target.checked ? hidden.filter(z => z !== layer.z) : [...hidden, layer.z])} />{layeredPartLabel(layer.name)}</label>)}</div><button onClick={() => setHiddenLayers([])}>显示全部部件</button></details>}
          <button className="primary-button avatar-apply" disabled={!ready || busy || avatar.loading} onClick={() => void change(draft)}><Check size={15} />用这个角色陪我</button>
          {(draft.rig.synth.eye || draft.rig.synth.mouth) && <p className="avatar-small-note">已补上通用闭眼或闭口差分，可在 PSD 中绘制专属差分以提升效果。</p>}
          <p className="avatar-small-note">{skeleton ? '头颈随鼠标轻转，头发和尾巴轻摆；待机时自然呼吸。立绘暂不支持独立口型。' : poseOnly ? isStandRig(draft.rig) && draft.rig.document.metadata?.debby?.motion ? '目光随鼠标轻轻转动，也会呼吸和点头；立绘暂不支持独立口型。' : '此角色以立绘切换表情，暂不支持独立口型与目光。' : '2.5D 支持目光、表情与口型。'}播放骨骼舞蹈时会暂时使用 3D 角色。</p>
          {(poseOnly || draft.name === 'Debby · 鲸鱼娘') && <details className="avatar-authoring"><summary>角色作者与许可</summary><p>上善 → ZipZipPipe → Small-tailqwq → JAdpp。{poseOnly ? 'Debby 清理边缘、适配表情并绑定骨架网格。' : 'Debby 使用 See-through 拆层补绘，并修整独立五官差分。'}</p><p>美术按 CC BY-NC-SA 4.0 提供：署名、非商用、相同方式共享。</p></details>}
        </>}
        <details className="avatar-authoring"><summary>准备自己的角色</summary><p>已有分层 PSD 可以直接导入。精细绑定可用 StandRig 制作，再导出含贴图的 .srig。</p><p>只有单张插画时，可用 See-through 拆分图层；该流程需要单独准备 GPU 推理环境。</p></details>
        <div className="avatar-library-actions"><button disabled={busy || avatar.loading} onClick={() => void run(avatar.use3d, '已切回 3D，保存的立绘仍然保留。')}>使用原来的 3D</button>{avatar.asset && <button title="移除保存的立绘" disabled={busy} onClick={() => void run(async () => { await avatar.remove(); setDraft(undefined); setReady(false) }, '已移除本机保存的立绘。')}><Trash2 size={14} /></button>}</div>
      </div>
    </div>
    {(busy || avatar.loading) && <p className="avatar-status" role="status">{avatar.loading ? '恢复上次的角色…' : progress || '正在保存…'}{progress && <button onClick={() => controller.current?.abort()}>取消导入</button>}</p>}
    {(error || avatar.error) && <p className="avatar-status error" role="alert">{error || avatar.error}</p>}
    {notice && <p className="avatar-status success" role="status">{notice}</p>}
    <footer className="avatar-studio-footer">立绘保存在本机 · 导入与预览不使用摄像头或麦克风</footer>
  </dialog>
}
