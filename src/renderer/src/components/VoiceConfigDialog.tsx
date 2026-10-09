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
      {(['baseUrl', 'textModel', 'asrModel', 'ttsModel', 'voice'] as const).map((field) => <label className="config-field" key={field}>{({ baseUrl: 'Base URL', textModel: '对话 / 视觉模型', asrModel: '语音识别模型', ttsModel: '语音合成模型', voice: '音色 ID' })[field]}
        <input aria-label={field} value={config[field]} spellCheck={false} maxLength={256} onChange={(event) => setConfig({ ...config, [field]: event.target.value })} />
      </label>)}
      <p className="config-note">Token Plan 需符合供应商对交互式智能体工具的使用要求，不用于后台自动化或共享服务。普通百炼 Key 不能与套餐地址混用。</p>
      <div className="config-actions"><span className="config-status" role="status">{companion.error}</span><button className="square-action" title="保存通义配置" disabled={busy || companion.state.active || (!key && !config.configured)}><Save size={17} /></button></div>
    </form>
  </dialog>
}

export function VoiceConsentDialog({ companion, onClose }: { companion: VoiceCompanionController; onClose: () => void }): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [consent, setConsent] = useState(false)
  const [camera, setCamera] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => previous?.focus() }, [])
  return <dialog ref={dialog} className="preferences-dialog no-drag" aria-labelledby="voice-consent-title" onCancel={onClose}>
    <header className="dialog-heading"><h2 id="voice-consent-title">陪你聊聊</h2><button className="ghost-icon" title="关闭陪伴授权" onClick={onClose}><X size={17} /></button></header>
    <p className="config-note">本次会话最多 15 分钟。你提交的语音、文字、行情和所选摄像头照片会发送至阿里云及模型服务；可能消耗额度。请避免发送敏感信息。</p>
    <label className="cloud-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>我同意本次会话的云端数据传输。</span></label>
    <label className="switch-row"><span>本次允许摄像头</span><input type="checkbox" disabled={!companion.state.config.vision} checked={camera} onChange={(event) => setCamera(event.target.checked)} /><i /></label>
    <p className="config-note">摄像头默认关闭，照片仅随主动提交的对话发送。退出陪伴、收起窗口或锁屏后停止采集；不保存原始音视频。Debby 是 AI，不替代现实中的陪伴或专业帮助。</p>
    <div className="config-actions"><span className="config-status" role="status">{companion.error}</span><button className="byok-command" disabled={!consent || busy} onClick={async () => { setBusy(true); const started = await companion.start(camera); setBusy(false); if (started) onClose() }}><Headphones size={15} />开始陪伴</button></div>
  </dialog>
}
