import { Headphones, Save, Square, Volume2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { VoiceCompanionController } from '../hooks/use-voice-companion'
import type { ReadAloudController } from '../hooks/use-read-aloud'
import { resolveSpeechStyle, speechPresets, speechPreviewText, speechStyles, type SpeechStyle } from '../../../shared/speech-style'

export function VoiceConfigDialog({ companion, reader, onClose }: { companion: VoiceCompanionController; reader: ReadAloudController; onClose: () => void }): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [config, setConfig] = useState(companion.state.config)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [previewText, setPreviewText] = useState(speechPreviewText)
  const speech = resolveSpeechStyle(config.speech), previewing = reader.loading || reader.speaking
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => previous?.focus() }, [])
  useEffect(() => () => reader.stop(), [reader.stop])
  return <dialog ref={dialog} className="preferences-dialog chat-config no-drag" aria-labelledby="voice-config-title" onCancel={onClose}>
    <header className="dialog-heading"><h2 id="voice-config-title"><Headphones size={19} />通义 BYOK</h2><button className="ghost-icon" title="关闭通义配置" onClick={onClose}><X size={17} /></button></header>
    <p className="config-note">{config.storage === 'env' ? '已读取本地 .env，密钥不会进入界面或构建产物。' : '你的百炼 Key 由系统加密保存。'} 模型调用消耗你的额度，不使用 OpenRouter 免费额度。</p>
    <form onSubmit={async (event) => { event.preventDefault(); reader.stop(); setBusy(true); const saved = await companion.configure({ ...config, speech, apiKey: key || undefined }); setKey(''); setBusy(false); if (saved) onClose() }}>
      <section className="speech-preview" aria-label="声音试听">
        <label className="config-field">Debby 的语气<select aria-label="声音语气" value={speech.style} onChange={event => { reader.stop(); const style = event.target.value as SpeechStyle; setConfig({ ...config, speech: style === 'custom' ? { ...speech, style } : { style } }) }}>
          {speechStyles.map(style => <option key={style} value={style}>{style === 'custom' ? '自定义语气' : speechPresets[style].label}</option>)}
        </select></label>
        <label className="config-field">试着说一句<textarea aria-label="试听台词" rows={3} maxLength={200} value={previewText} onChange={event => { reader.stop(); setPreviewText(event.target.value) }} /></label>
        <div className="speech-preview-actions"><button type="button" className="menu-command" aria-label={previewing ? '停止试听' : '试听这句话'} disabled={busy || !config.configured || !previewText.trim()} onClick={() => { if (previewing) reader.stop(); else void reader.preview({ text: previewText, voice: config.voice, ttsModel: config.ttsModel, speech }) }}>{previewing ? <Square size={14} /> : <Volume2 size={16} />}{reader.loading ? '生成中 · 点击停止' : reader.speaking ? '停止试听' : '试听这句话'}</button><span role="status">{reader.error ?? (reader.loading ? '正在准备声音…' : reader.speaking ? '正在试听' : config.configured ? '满意后保存，用于日常对话' : '保存 Key 后即可试听')}</span></div>
        <details className="config-advanced"><summary>语速、音调与自定义指令</summary>
          {(['rate', 'pitch'] as const).map(field => <label className="speech-slider" key={field}>{field === 'rate' ? '语速' : '音调'}<input type="range" aria-label={field === 'rate' ? '试听语速' : '试听音调'} min="0.8" max="1.2" step="0.01" value={speech[field]} onChange={event => { reader.stop(); setConfig({ ...config, speech: { ...speech, [field]: Number(event.target.value) } }) }} /><output>{speech[field].toFixed(2)}×</output></label>)}
          <label className="config-field">语气指令<textarea aria-label="声音语气指令" rows={3} maxLength={500} value={speech.instruction} placeholder="描述说话方式、情感和停顿…" onChange={event => { reader.stop(); setConfig({ ...config, speech: { ...speech, style: 'custom', instruction: event.target.value } }) }} /></label>
        </details>
      </section>
      <label className="config-field">API Key<input type="password" aria-label="百炼 API Key" autoComplete="off" spellCheck={false} maxLength={512} value={key} placeholder={config.configured ? '已配置，留空保持不变' : 'sk-…'} onChange={(event) => setKey(event.target.value)} /></label>
      <details className="config-advanced"><summary>模型与音色</summary>{(['baseUrl', 'textModel', 'asrModel', 'ttsModel', 'voice'] as const).map((field) => <label className="config-field" key={field}>{({ baseUrl: 'Base URL', textModel: '对话 / 视觉模型', asrModel: '语音识别模型', ttsModel: '语音合成模型', voice: '音色 ID' })[field]}
        <input aria-label={field} value={config[field]} spellCheck={false} maxLength={256} onChange={(event) => { reader.stop(); setConfig({ ...config, [field]: event.target.value }) }} />
      </label>)}</details>
      <p className="config-note">保存后直接聊，消息会发送至阿里云。麦克风与摄像头仅在点击时开启。</p>
      <div className="config-actions"><span className="config-status" role="status">{companion.error}</span><button className="square-action" title="保存通义配置" disabled={busy || companion.state.active || (!key && !config.configured)}><Save size={17} /></button></div>
    </form>
  </dialog>
}
