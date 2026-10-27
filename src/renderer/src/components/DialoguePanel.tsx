import { Headphones, History, KeyRound, MessageSquare, Mic, Power, RotateCcw, Send, Settings2, Square, Video, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { DebbyChatController } from '../hooks/use-debby-chat'
import { brand } from '../../../shared/brand'
import type { VoiceCompanionController } from '../hooks/use-voice-companion'
import type { ReadAloudController } from '../hooks/use-read-aloud'
import { CameraPreview } from './CameraPreview'
import { VoiceConfigDialog, VoiceConsentDialog } from './VoiceConfigDialog'
import { dialoguePrompts } from '../../../shared/dialogue-guidance'
import { debbyCharacter } from '../../../shared/debby-character'

export function DialoguePanel({ chat, companion, reader, onConfigure, showcasing, active, focusRequest, draft }: { chat: DebbyChatController; companion: VoiceCompanionController; reader: ReadAloudController; onConfigure: () => void; showcasing: boolean; active: boolean; focusRequest: number; draft?: { id: number; text: string } }): React.JSX.Element {
  const [input, setInput] = useState('')
  const acceptedDraft = useRef(0)
  useEffect(() => { if (active && draft && draft.id !== acceptedDraft.current) { acceptedDraft.current = draft.id; setInput(draft.text) } }, [active, draft])
  const [history, setHistory] = useState(false)
  const [mode, setMode] = useState<'text' | 'voice'>('text')
  const chosen = useRef(false)
  const [voiceConfig, setVoiceConfig] = useState(false)
  const [consent, setConsent] = useState(false)
  const [autoRead, setAutoRead] = useState(false)
  useEffect(() => { if (!chosen.current) setMode(chat.state.config.configured ? 'text' : companion.state.config.configured ? 'voice' : 'text') }, [companion.state.config.configured, chat.state.config.configured])
  const voice = mode === 'voice'
  const messages = voice ? companion.state.chat.messages : chat.state.messages
  const busy = voice ? companion.busy : chat.state.busy
  const body = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const startRef = useRef<HTMLButtonElement>(null)
  const submitting = useRef(false)
  const question = messages.filter((line) => line.role === 'user').at(-1)
  const questionIndex = question ? messages.indexOf(question) : -1
  const last = messages.slice(questionIndex + 1).filter((line) => line.role === 'assistant').at(-1)
  const configured = voice ? companion.state.active : chat.state.config.configured && chat.state.config.cloudConsent
  useEffect(() => {
    if (!active || !focusRequest) return
    const frame = requestAnimationFrame(() => (inputRef.current ?? startRef.current)?.focus())
    return () => cancelAnimationFrame(frame)
  }, [active, focusRequest, configured, voice])
  const speaking = voice ? companion.speaking : reader.speaking || reader.loading
  const recording = voice && companion.recording !== 'off'
  const voiceStatus = companion.recording !== 'off' ? '正在听你说' : speaking ? '正在说话' : ({ off: '陪你聊聊', ready: '我在呢', transcribing: '听清你的话', thinking: '正在回复', synthesizing: '准备声音' })[companion.state.phase]
  const configure = () => { if (voice) setVoiceConfig(true); else onConfigure() }
  const beginSetup = () => { chosen.current = true; if (voice && companion.state.config.configured) setConsent(true); else configure() }
  const sendText = async (text: string): Promise<void> => {
    if (submitting.current || busy || recording || showcasing) return
    if (!configured) { setInput(text); beginSetup(); return }
    if (!text.trim()) return
    submitting.current = true
    try {
      if (!voice) reader.stop()
      if (await (voice ? companion.send(text) : chat.send(text))) setInput((current) => current === text ? '' : current)
    } finally { submitting.current = false }
  }
  const send = () => sendText(input)
  const failure = voice ? companion.error : chat.error ?? reader.error
  const suggestions = dialoguePrompts(question?.text, Boolean(last?.text && last.status === 'done'), Boolean(voice ? companion.error : chat.error))
  const updateRead = reader.update, stopRead = reader.stop
  useEffect(() => {
    if (!active || voice || showcasing) { setAutoRead(false); stopRead() }
  }, [active, voice, showcasing, stopRead])
  useEffect(() => {
    if (!active || voice || showcasing || !autoRead || !last?.text.trim()) return
    if (last.status === 'error' || last.status === 'cancelled' || chat.state.error) { stopRead(); return }
    void updateRead(question?.id ?? last.id, last.id, last.text, !busy && last.status === 'done')
  }, [active, voice, showcasing, autoRead, busy, question?.id, last?.id, last?.text, last?.status, chat.state.error, updateRead, stopRead])
  useEffect(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight }, [last?.text])
  return <section className="dialogue-panel" aria-label="与 Debby 对话">
    <header className="dialogue-toolbar"><div className="dialogue-mode" role="group" aria-label="对话方式">
      <button className="ghost-icon" title="文字对话" aria-pressed={!voice} onClick={() => { chosen.current = true; setMode('text'); void companion.stop() }}><MessageSquare size={16} /></button>
      <button className="ghost-icon" title="通义陪伴" aria-pressed={voice} onClick={() => { chosen.current = true; setMode('voice'); void chat.cancel() }}><Headphones size={16} /></button>
    </div><span title={voice ? companion.state.config.textModel : chat.state.config.modelId}><i className={busy || recording ? 'busy' : ''} />{showcasing ? '演示中' : voice ? companion.state.active ? '通义 · 陪伴中' : '通义 · BYOK' : chat.state.config.modelId === 'openrouter/free' ? 'OpenRouter · Free' : chat.state.config.modelId}</span>
      <div>{!voice && <button className="ghost-icon" aria-label="阿里云自动朗读" title={autoRead ? '关闭自动朗读' : '开启阿里云 TTS · 回复文字将发送至阿里云'} aria-pressed={autoRead} disabled={showcasing} onClick={() => {
        if (autoRead) { setAutoRead(false); reader.stop() }
        else if (!companion.state.config.configured) setVoiceConfig(true)
        else if (reader.prepare()) setAutoRead(true)
      }}>{autoRead ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>}<button className="ghost-icon" title="会话回看" aria-pressed={history} onClick={() => setHistory(!history)}><History size={17} /></button>{voice && companion.state.active ? <button className="ghost-icon" title="结束陪伴" onClick={() => void companion.stop()}><Power size={16} /></button> : <button className="ghost-icon" title="新会话" disabled={busy || !messages.length} onClick={() => { reader.stop(); void (voice ? companion.clear() : chat.clear()) }}><RotateCcw size={16} /></button>}<button className="ghost-icon" title="对话设置" disabled={busy || (voice && companion.state.active)} onClick={configure}><Settings2 size={17} /></button></div></header>
    {voice && companion.camera && <CameraPreview stream={companion.camera} onOff={() => void companion.toggleCamera()} />}
    {history && <aside className="dialogue-history" aria-label="会话记录"><header><strong>会话回看</strong><button className="ghost-icon" title="关闭会话回看" onClick={() => setHistory(false)}><X size={16} /></button></header><div>
      {!messages.some((line) => line.text) && <p className="history-empty">还没有对话。</p>}
      {messages.filter((line) => line.text).map((line) => <article key={line.id}><strong>{line.role === 'user' ? '你' : brand.name}</strong><p>{line.text}</p>{line.status === 'cancelled' && <small>已停止</small>}</article>)}
    </div></aside>}
    <div className="dialogue-box">
      <div className="dialogue-nameplate"><strong>{brand.name}</strong><span>{voice ? companion.state.chat.activeTool ?? voiceStatus : chat.state.activeTool ?? (busy ? '正在回复' : reader.loading ? '准备声音' : reader.speaking ? '正在朗读' : autoRead ? '阿里云朗读已开启' : '陪你聊聊')}</span></div>
      {question && <p className="dialogue-question" title={question.text}>你 · {question.text}</p>}
      <div className="dialogue-text" ref={body} tabIndex={0} aria-label="Debby 的台词">
        <p>{last?.text || (last?.status === 'cancelled' ? '回复已停止。' : busy ? '正在回复…' : question ? '我在呢，可以继续聊。' : voice || configured ? debbyCharacter.welcome : debbyCharacter.welcomeSetup)}</p>
        {last?.status === 'cancelled' && <small>已停止</small>}
      </div>
      {!busy && !recording && !input.trim() && !showcasing && <div className="dialogue-suggestions" role="group" aria-label={question ? '接着聊' : '试着问一句'}>
        {suggestions.map((prompt) => <button type="button" key={prompt.label} onClick={() => { setInput(prompt.text); void sendText(prompt.text) }}>{prompt.label}</button>)}
      </div>}
      <div className="dialogue-feedback" role="status">{failure ?? (recording ? '麦克风已开启 · 本地录音' : voice && busy ? voiceStatus : chat.state.activeTool && !voice ? `${chat.state.activeTool}…` : busy ? '正在回复…' : !configured ? input.trim() ? '问题已保留 · 连接后点发送，从这句开始。' : voice ? '先开启本次陪伴；麦克风和摄像头由你决定。' : '选一句或直接输入 · 首次需连接自己的模型 Key。' : input.trim() ? '按 Enter 发送 · Shift + Enter 换行' : voice ? '云端会话 · 点一句继续聊 · 结束后清空记录' : '点一句继续聊 · 公开行情可能延迟，不构成投资建议。')}</div>
      <form className={'dialogue-input' + (!configured ? ' setup-input' : voice ? ' companion-input' : '') + (voice && configured && companion.state.cameraAllowed ? ' with-camera' : '')} onSubmit={(event) => { event.preventDefault(); if (!busy && !recording) void send() }}>
        <textarea ref={inputRef} aria-label="对 Debby 说" value={input} maxLength={4000} rows={1} placeholder={configured ? '问行情、聊计划，或喊一声 Debby…' : '先写一句，连接后发送…'} disabled={showcasing || recording} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy && !showcasing && !recording) void send() } }} />
        {!configured ? <button ref={startRef} type="button" className="byok-command" disabled={showcasing} onClick={beginSetup}>{voice ? <Headphones size={15} /> : <KeyRound size={15} />}{voice && companion.state.config.configured ? '开始陪伴' : '配置 BYOK'}</button> : <>
          {voice && <button type="button" className={'ghost-icon companion-mic' + (recording ? ' recording' : '')} data-recording={companion.recording} title={recording ? '结束录音并发送' : '录音对话'} disabled={companion.recording === 'finishing'} aria-pressed={recording} onClick={() => void companion.toggleRecording()}><Mic size={17} />{recording && <span style={{ height: `${Math.max(2, companion.inputLevel * 18)}px` }} />}</button>}
          {voice && companion.state.cameraAllowed && <button type="button" className="ghost-icon" title={companion.camera ? '关闭摄像头' : '开启摄像头'} aria-pressed={Boolean(companion.camera)} onClick={() => void companion.toggleCamera()}><Video size={17} /></button>}
          {busy || speaking || recording ? <button type="button" className="square-action stop-reply" title="停止回复" onClick={() => { reader.stop(); void (voice ? companion.interrupt() : chat.cancel()) }}><Square size={14} /></button> : <button className="square-action" title="发送消息" disabled={!input.trim() || showcasing}><Send size={16} /></button>}
        </>}
      </form>
    </div>
    {voiceConfig && <VoiceConfigDialog companion={companion} onClose={() => setVoiceConfig(false)} />}
    {consent && <VoiceConsentDialog companion={companion} onClose={() => setConsent(false)} />}
  </section>
}
