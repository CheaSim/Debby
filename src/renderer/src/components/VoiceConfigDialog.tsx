import { Headphones, Save, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { VoiceCompanionController } from '../hooks/use-voice-companion'

export function VoiceConfigDialog({ companion, onClose }: { companion: VoiceCompanionController; onClose: () => void }): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [config, setConfig] = useState(companion.state.config)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => previous?.focus() }, [])
  return <dialog ref={dialog} className="preferences-dialog chat-config no-drag" aria-labelledby="voice-config-title" onCancel={onClose}>
    <header className="dialog-heading"><h2 id="voice-config-title"><Headphones size={19} />通义 BYOK</h2><button className="ghost-icon" title="关闭通义配置" onClick={onClose}><X size={17} /></button></header>
    <p className="config-note">{config.storage === 'env' ? '已读取本地 .env，密钥不会进入界面或构建产物。' : '你的百炼 Key 由系统加密保存。'} 模型调用消耗你的额度，不使用 OpenRouter 免费额度。</p>
    <form onSubmit={async (event) => { event.preventDefault(); setBusy(true); const saved = await companion.configure({ ...config, apiKey: key || undefined }); setKey(''); setBusy(false); if (saved) onClose() }}>
      <label className="config-field">API Key<input type="password" aria-label="百炼 API Key" autoComplete="off" spellCheck={false} maxLength={512} value={key} placeholder={config.configured ? '已配置，留空保持不变' : 'sk-…'} onChange={(event) => setKey(event.target.value)} /></label>
      <details className="config-advanced"><summary>模型与音色</summary>{(['baseUrl', 'textModel', 'asrModel', 'ttsModel', 'voice'] as const).map((field) => <label className="config-field" key={field}>{({ baseUrl: 'Base URL', textModel: '对话 / 视觉模型', asrModel: '语音识别模型', ttsModel: '语音合成模型', voice: '音色 ID' })[field]}
        <input aria-label={field} value={config[field]} spellCheck={false} maxLength={256} onChange={(event) => setConfig({ ...config, [field]: event.target.value })} />
      </label>)}</details>
      <p className="config-note">保存后直接聊，消息会发送至阿里云。麦克风与摄像头仅在点击时开启。</p>
      <div className="config-actions"><span className="config-status" role="status">{companion.error}</span><button className="square-action" title="保存通义配置" disabled={busy || companion.state.active || (!key && !config.configured)}><Save size={17} /></button></div>
    </form>
  </dialog>
}
