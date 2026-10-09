import { Headphones, History, KeyRound, MessageSquare, Mic, Power, RotateCcw, Send, Settings2, Square, Video, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { DebbyChatController } from '../hooks/use-debby-chat'
import { brand } from '../../../shared/brand'
import type { VoiceCompanionController } from '../hooks/use-voice-companion'
import { CameraPreview } from './CameraPreview'
import { VoiceConfigDialog, VoiceConsentDialog } from './VoiceConfigDialog'

export function DialoguePanel({ chat, companion, onConfigure, showcasing }: { chat: DebbyChatController; companion: VoiceCompanionController; onConfigure: () => void; showcasing: boolean }): React.JSX.Element {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState(false)
  const [mode, setMode] = useState<'text' | 'voice'>('text')
  const chosen = useRef(false)
  const [voiceConfig, setVoiceConfig] = useState(false)
  const [consent, setConsent] = useState(false)
  useEffect(() => { if (!chosen.current && companion.state.config.configured) setMode('voice') }, [companion.state.config.configured])
  const voice = mode === 'voice'
  const messages = voice ? companion.state.chat.messages : chat.state.messages
  const busy = voice ? companion.busy : chat.state.busy
  const body = useRef<HTMLDivElement>(null)
  const question = messages.filter((line) => line.role === 'user').at(-1)
  const questionIndex = question ? messages.indexOf(question) : -1
  const last = messages.slice(questionIndex + 1).filter((line) => line.role === 'assistant').at(-1)
  const configured = voice ? companion.state.active : chat.state.config.configured && chat.state.config.cloudConsent
  const send = async (): Promise<void> => { if (input.trim() && await (voice ? companion.send(input) : chat.send(input))) setInput('') }
  const speaking = voice && companion.speaking
  const recording = voice && companion.recording !== 'off'
  const voiceStatus = companion.recording !== 'off' ? '正在听你说' : speaking ? '正在说话' : ({ off: '陪你聊聊', ready: '我在呢', transcribing: '听清你的话', thinking: '正在回复', synthesizing: '准备声音' })[companion.state.phase]
  const configure = () => { if (voice) setVoiceConfig(true); else onConfigure() }
  useEffect(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight }, [last?.text])
  return <section className="dialogue-panel" aria-label="与 Debby 对话">
    <header className="dialogue-toolbar"><div className="dialogue-mode" role="group" aria-label="对话方式">
      <button className="ghost-icon" title="文字对话" aria-pressed={!voice} onClick={() => { chosen.current = true; setMode('text'); void companion.stop() }}><MessageSquare size={16} /></button>
      <button className="ghost-icon" title="通义陪伴" aria-pressed={voice} onClick={() => { chosen.current = true; setMode('voice'); void chat.cancel() }}><Headphones size={16} /></button>
    </div><span title={voice ? companion.state.config.textModel : chat.state.config.modelId}><i className={busy || recording ? 'busy' : ''} />{showcasing ? '演示中' : voice ? companion.state.active ? '通义 · 陪伴中' : '通义 · BYOK' : chat.state.config.modelId === 'openrouter/free' ? 'OpenRouter · Free' : chat.state.config.modelId}</span>
      <div><button className="ghost-icon" title="会话回看" aria-pressed={history} onClick={() => setHistory(!history)}><History size={17} /></button>{voice && companion.state.active ? <button className="ghost-icon" title="结束陪伴" onClick={() => void companion.stop()}><Power size={16} /></button> : <button className="ghost-icon" title="新会话" disabled={busy || !messages.length} onClick={() => void (voice ? companion.clear() : chat.clear())}><RotateCcw size={16} /></button>}<button className="ghost-icon" title="对话设置" disabled={busy || (voice && companion.state.active)} onClick={configure}><Settings2 size={17} /></button></div></header>
    {voice && companion.camera && <CameraPreview stream={companion.camera} onOff={() => void companion.toggleCamera()} />}
    {history && <aside className="dialogue-history" aria-label="会话记录"><header><strong>会话回看</strong><button className="ghost-icon" title="关闭会话回看" onClick={() => setHistory(false)}><X size={16} /></button></header><div>
      {!messages.some((line) => line.text) && <p className="history-empty">还没有对话。</p>}
      {messages.filter((line) => line.text).map((line) => <article key={line.id}><strong>{line.role === 'user' ? '你' : brand.name}</strong><p>{line.text}</p>{line.status === 'cancelled' && <small>已停止</small>}</article>)}
    </div></aside>}
    <div className="dialogue-box">
      <div className="dialogue-nameplate"><strong>{brand.name}</strong><span>{voice ? companion.state.chat.activeTool ?? voiceStatus : chat.state.activeTool ?? (busy ? '正在回复' : '陪你聊聊')}</span></div>
      {question && <p className="dialogue-question" title={question.text}>你 · {question.text}</p>}
      <div className="dialogue-text" ref={body} tabIndex={0} aria-label="Debby 的台词">
        <p>{last?.text || (last?.status === 'cancelled' ? '回复已停止。' : busy ? '正在回复…' : question ? '我在呢，可以继续聊。' : voice ? '我在呢。今天过得怎么样？' : configured ? '我在呢。今天想聊些什么？' : '我是 Debby。先连上你的 OpenRouter Key，我们就能一起聊行情啦。')}</p>
        {last?.status === 'cancelled' && <small>已停止</small>}
      </div>
      <div className="dialogue-feedback" role="status">{(voice ? companion.error : chat.error) ?? (recording ? '麦克风已开启 · 本地录音' : voice && busy ? voiceStatus : voice && configured ? '云端会话 · 无后台上传 · 结束后清空记录' : chat.state.activeTool && !voice ? `${chat.state.activeTool}…` : busy ? '正在回复…' : !configured ? '尚未开启对话' : '公开行情可能延迟，不构成投资建议。')}</div>
      {!configured ? <button className="byok-command" disabled={showcasing} onClick={() => { if (voice && companion.state.config.configured) setConsent(true); else configure() }}>{voice ? <Headphones size={15} /> : <KeyRound size={15} />}{voice && companion.state.config.configured ? '开始陪伴' : '配置 BYOK'}</button> : <form className={'dialogue-input' + (voice ? ' companion-input' : '') + (voice && companion.state.cameraAllowed ? ' with-camera' : '')} onSubmit={(event) => { event.preventDefault(); if (!busy && !recording) void send() }}>
        <textarea aria-label="对 Debby 说" value={input} maxLength={4000} rows={1} placeholder="对 Debby 说…" disabled={showcasing || recording} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy && !showcasing && !recording) void send() } }} />
        {voice && <button type="button" className={'ghost-icon companion-mic' + (recording ? ' recording' : '')} data-recording={companion.recording} title={recording ? '结束录音并发送' : '录音对话'} disabled={companion.recording === 'finishing'} aria-pressed={recording} onClick={() => void companion.toggleRecording()}><Mic size={17} />{recording && <span style={{ height: `${Math.max(2, companion.inputLevel * 18)}px` }} />}</button>}
        {voice && companion.state.cameraAllowed && <button type="button" className="ghost-icon" title={companion.camera ? '关闭摄像头' : '开启摄像头'} aria-pressed={Boolean(companion.camera)} onClick={() => void companion.toggleCamera()}><Video size={17} /></button>}
        {busy || speaking || recording ? <button type="button" className="square-action stop-reply" title="停止回复" onClick={() => void (voice ? companion.interrupt() : chat.cancel())}><Square size={14} /></button> : <button className="square-action" title="发送消息" disabled={!input.trim() || showcasing}><Send size={16} /></button>}
      </form>}
    </div>
    {voiceConfig && <VoiceConfigDialog companion={companion} onClose={() => setVoiceConfig(false)} />}
    {consent && <VoiceConsentDialog companion={companion} onClose={() => setConsent(false)} />}
  </section>
}
