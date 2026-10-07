import { ExternalLink, KeyRound, LoaderCircle, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { defaultChatModel, type ChatModel } from '../../../shared/chat'
import type { DebbyChatController } from '../hooks/use-debby-chat'

export function ChatConfigDialog({ chat, onClose }: { chat: DebbyChatController; onClose: () => void }): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const [key, setKey] = useState('')
  const [modelId, setModelId] = useState(chat.state.config.modelId)
  const [consent, setConsent] = useState(chat.state.config.cloudConsent)
  const [models, setModels] = useState<ChatModel[]>([{ id: defaultChatModel, name: 'Free Models Router', contextLength: 200000 }])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const refresh = async (): Promise<void> => {
    setBusy(true)
    try { setModels(await chat.listModels()); setStatus('免费模型目录已更新') } catch { setStatus('模型目录暂时不可用，请稍后刷新。') }
    finally { setBusy(false) }
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.showModal()
    return () => { previous?.focus() }
  }, [])
  const save = async (): Promise<void> => {
    setBusy(true)
    const saved = await chat.configure({ apiKey: key || undefined, modelId, cloudConsent: consent })
    setKey('')
    setBusy(false)
    if (saved) onClose()
  }
  return <dialog ref={dialog} className="preferences-dialog chat-config no-drag" aria-labelledby="chat-config-title" onCancel={onClose}>
    <header className="dialog-heading"><h2 id="chat-config-title"><KeyRound size={19} />BYOK</h2><button className="ghost-icon" title="关闭 BYOK" onClick={onClose}><X size={17} /></button></header>
    <p className="config-note">免费模型也需要你自己的 OpenRouter Key。额度和可用性由账户决定，不自动切换收费模型。</p>
    <form onSubmit={(event) => { event.preventDefault(); void save() }}>
      <label className="config-field">API Key<input type="password" aria-label="OpenRouter API Key" value={key} autoComplete="off" spellCheck={false} maxLength={512} placeholder={chat.state.config.configured ? '已加密保存，留空保持不变' : 'sk-or-…'} onChange={(event) => setKey(event.target.value)} /></label>
      <div className="config-model-row"><label className="config-field">免费模型<select aria-label="对话模型" value={modelId} onChange={(event) => setModelId(event.target.value)}>
        {!models.some((model) => model.id === modelId) && <option value={modelId}>{modelId} · 待验证</option>}
        {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
      </select></label><button type="button" className="ghost-icon" title="刷新免费模型" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} /></button></div>
      <label className="cloud-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>允许将对话和查询的行情发送至 OpenRouter 与模型供应商。</span></label>
      <p className="config-note">供应商可能记录或使用输入训练模型，请勿发送账户、持仓或其他敏感信息。Key 由系统加密；会话仅保留在内存。</p>
      <div className="config-actions"><button type="button" className="menu-command" onClick={() => void chat.openKeyPage()}><ExternalLink size={15} />获取 Key</button>
        <button type="button" className="ghost-icon" title="移除 API Key" disabled={busy || !chat.state.config.configured} onClick={async () => { if (await chat.configure({ modelId: defaultChatModel, cloudConsent: false, removeKey: true })) { setConsent(false); setModelId(defaultChatModel); setKey(''); setStatus('Key 已移除') } }}><Trash2 size={16} /></button>
        <button type="button" className="menu-command" disabled={busy || !chat.state.config.configured} onClick={async () => { setBusy(true); try { setStatus(await chat.checkConnection()) } catch { setStatus('连接失败，请检查网络和 Key。') } finally { setBusy(false) } }}>验证连接</button>
        <button className="square-action" title="保存 BYOK" disabled={busy || (!key && !chat.state.config.configured)}>{busy ? <LoaderCircle size={17} className="spinning" /> : <Save size={17} />}</button></div>
      {(chat.error || status) && <p className="config-status" role="status">{chat.error || status}</p>}
    </form>
  </dialog>
}
