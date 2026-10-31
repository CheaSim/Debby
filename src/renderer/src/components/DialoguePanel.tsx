import { Headphones, History, KeyRound, MessageSquare, Mic, MoreHorizontal, Power, RotateCcw, Send, Settings2, Square, Video, Volume2, VolumeX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { DebbyChatController } from '../hooks/use-debby-chat'
import { brand } from '../../../shared/brand'
import type { VoiceCompanionController } from '../hooks/use-voice-companion'
import type { ReadAloudController } from '../hooks/use-read-aloud'
import { CameraPreview } from './CameraPreview'
import { VoiceConfigDialog } from './VoiceConfigDialog'
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
  const menu = useRef<HTMLDetailsElement>(null)
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
  const configured = voice ? companion.state.config.configured : chat.state.config.configured
  useEffect(() => {
    const field = inputRef.current
    if (field) { field.style.height = '36px'; field.style.height = `${Math.min(64, field.scrollHeight + 2)}px` }
  }, [input, configured, voice])
  useEffect(() => {
    if (!active || !focusRequest) return
    const frame = requestAnimationFrame(() => (inputRef.current ?? startRef.current)?.focus())
    return () => cancelAnimationFrame(frame)
  }, [active, focusRequest, configured, voice])
  const speaking = voice ? companion.speaking : reader.speaking || reader.loading
  const recording = voice && companion.recording !== 'off'
  const voiceStatus = companion.recording !== 'off' ? '正在听你说' : speaking ? '正在说话' : ({ off: '陪你聊聊', ready: '我在呢', transcribing: '听清你的话', thinking: '正在回复', synthesizing: '准备声音' })[companion.state.phase]
  const closeMenu = () => { if (menu.current) menu.current.open = false }
  const configure = async () => { closeMenu(); if (voice) { await companion.stop(); setVoiceConfig(true) } else onConfigure() }
  const beginSetup = () => { chosen.current = true; void configure() }
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
    </div><span className="dialogue-presence"><i className={busy || recording ? 'busy' : ''} />{showcasing ? '演示中' : '我在呢'}</span>
      <div>{!voice && <button className="ghost-icon" aria-label="阿里云自动朗读" title={autoRead ? '关闭自动朗读' : '开启阿里云 TTS · 回复文字将发送至阿里云'} aria-pressed={autoRead} disabled={showcasing} onClick={() => {
        if (autoRead) { setAutoRead(false); reader.stop() }
        else if (!companion.state.config.configured) setVoiceConfig(true)
        else if (reader.prepare()) setAutoRead(true)
      }}>{autoRead ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>}
      <details className="dialogue-more" ref={menu} onKeyDown={(event) => { if (event.key === 'Escape') closeMenu() }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) closeMenu() }}>
        <summary className="ghost-icon" title="更多对话选项" aria-label="更多对话选项"><MoreHorizontal size={19} /></summary>
        <div className="dialogue-menu" role="group" aria-label="对话选项">
          <button title="会话回看" aria-pressed={history} onClick={() => { setHistory(!history); closeMenu() }}><History size={16} />会话回看</button>
          <button title="新会话" disabled={busy || recording || !messages.length} onClick={() => { closeMenu(); reader.stop(); void (voice ? companion.clear() : chat.clear()) }}><RotateCcw size={16} />重新聊聊</button>
          {voice && configured && companion.state.config.vision && <button title={companion.camera ? '关闭摄像头' : '开启摄像头'} aria-pressed={Boolean(companion.camera)} onClick={() => { closeMenu(); void companion.toggleCamera() }}><Video size={16} />{companion.camera ? '关闭摄像头' : '开启摄像头'}</button>}
          {voice && companion.state.active && <button title="结束陪伴" onClick={() => { closeMenu(); void companion.stop() }}><Power size={16} />结束陪伴</button>}
          <button title="对话设置" disabled={busy || recording} onClick={() => void configure()}><Settings2 size={16} />模型设置</button>
        </div>
      </details></div></header>
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
        {suggestions.slice(0, 2).map((prompt) => <button type="button" key={prompt.label} onClick={() => { setInput(prompt.text); void sendText(prompt.text) }}>{prompt.label}</button>)}
      </div>}
      <div className="dialogue-feedback" role="status">{failure ?? (recording ? '正在听 · 再点麦克风发送' : !configured ? '首次连接模型，之后直接聊。' : input.trim() ? 'Enter 发送 · Shift + Enter 换行' : '')}</div>
      <form className={'dialogue-input' + (!configured ? ' setup-input' : voice ? ' companion-input' : '')} onSubmit={(event) => { event.preventDefault(); if (!busy && !recording) void send() }}>
        <textarea ref={inputRef} aria-label="对 Debby 说" value={input} maxLength={4000} rows={1} placeholder={configured ? '和我聊聊…' : '先写一句…'} disabled={showcasing || recording} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy && !showcasing && !recording) void send() } }} />
        {!configured ? <button ref={startRef} type="button" className="byok-command" disabled={showcasing} onClick={beginSetup}><KeyRound size={15} />连接模型</button> : <>
          {voice && <button type="button" className={'ghost-icon companion-mic' + (recording ? ' recording' : '')} data-recording={companion.recording} title={recording ? '结束录音并发送' : '录音对话'} disabled={companion.recording === 'finishing'} aria-pressed={recording} onClick={() => void companion.toggleRecording()}><Mic size={17} />{recording && <span style={{ height: `${Math.max(2, companion.inputLevel * 18)}px` }} />}</button>}
          {busy || speaking || recording ? <button type="button" className="square-action stop-reply" title="停止回复" onClick={() => { reader.stop(); void (voice ? companion.interrupt() : chat.cancel()) }}><Square size={14} /></button> : <button className="square-action" title="发送消息" disabled={!input.trim() || showcasing}><Send size={16} /></button>}
        </>}
      </form>
    </div>
    {voiceConfig && <VoiceConfigDialog companion={companion} onClose={() => setVoiceConfig(false)} />}
  </section>
}
