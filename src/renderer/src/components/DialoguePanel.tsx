import { History, KeyRound, RotateCcw, Send, Settings2, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { DebbyChatController } from '../hooks/use-debby-chat'
import { brand } from '../../../shared/brand'

export function DialoguePanel({ chat, onConfigure, showcasing }: { chat: DebbyChatController; onConfigure: () => void; showcasing: boolean }): React.JSX.Element {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const question = chat.state.messages.filter((line) => line.role === 'user').at(-1)
  const questionIndex = question ? chat.state.messages.indexOf(question) : -1
  const last = chat.state.messages.slice(questionIndex + 1).filter((line) => line.role === 'assistant').at(-1)
  const configured = chat.state.config.configured && chat.state.config.cloudConsent
  const send = async (): Promise<void> => { if (input.trim() && await chat.send(input)) setInput('') }
  useEffect(() => { if (body.current) body.current.scrollTop = body.current.scrollHeight }, [last?.text])
  return <section className="dialogue-panel" aria-label="与 Debby 对话">
    <header className="dialogue-toolbar"><span><i className={chat.state.busy ? 'busy' : ''} />{showcasing ? '演示中 · 对话暂停' : chat.state.config.modelId === 'openrouter/free' ? 'OpenRouter · Free' : chat.state.config.modelId}</span>
      <div><button className="ghost-icon" title="会话回看" aria-pressed={history} onClick={() => setHistory(!history)}><History size={17} /></button><button className="ghost-icon" title="新会话" disabled={chat.state.busy || !chat.state.messages.length} onClick={() => void chat.clear()}><RotateCcw size={16} /></button><button className="ghost-icon" title="对话设置" disabled={chat.state.busy} onClick={onConfigure}><Settings2 size={17} /></button></div></header>
    {history && <aside className="dialogue-history" aria-label="会话记录"><header><strong>会话回看</strong><button className="ghost-icon" title="关闭会话回看" onClick={() => setHistory(false)}><X size={16} /></button></header><div>
      {!chat.state.messages.some((line) => line.text) && <p className="history-empty">还没有对话。</p>}
      {chat.state.messages.filter((line) => line.text).map((line) => <article key={line.id}><strong>{line.role === 'user' ? '你' : brand.name}</strong><p>{line.text}</p>{line.status === 'cancelled' && <small>已停止</small>}</article>)}
    </div></aside>}
    <div className="dialogue-box">
      <div className="dialogue-nameplate"><strong>{brand.name}</strong><span>{chat.state.activeTool ?? (chat.state.busy ? '正在回复' : '陪你聊聊')}</span></div>
      {question && <p className="dialogue-question" title={question.text}>你 · {question.text}</p>}
      <div className="dialogue-text" ref={body} tabIndex={0} aria-label="Debby 的台词">
        <p>{last?.text || (last?.status === 'cancelled' ? '回复已停止。' : chat.state.busy ? '让我想一想…' : question ? '我在呢，可以继续聊。' : configured ? '我在呢。今天想聊些什么？' : '我是 Debby。先连上你的 OpenRouter Key，我们就能一起聊行情啦。')}</p>
        {last?.status === 'cancelled' && <small>已停止</small>}
      </div>
      <div className="dialogue-feedback" role="status">{chat.error ?? (chat.state.activeTool ? `${chat.state.activeTool}…` : chat.state.busy ? '正在思考…' : !configured ? '尚未连接模型' : '公开行情可能延迟，不构成投资建议。')}</div>
      {!configured ? <button className="byok-command" onClick={onConfigure}><KeyRound size={15} />配置 BYOK</button> : <form className="dialogue-input" onSubmit={(event) => { event.preventDefault(); void send() }}>
        <textarea aria-label="对 Debby 说" value={input} maxLength={4000} rows={1} placeholder="对 Debby 说…" disabled={showcasing} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!chat.state.busy && !showcasing) void send() } }} />
        {chat.state.busy ? <button type="button" className="square-action stop-reply" title="停止回复" onClick={() => void chat.cancel()}><Square size={14} /></button> : <button className="square-action" title="发送消息" disabled={!input.trim() || showcasing}><Send size={16} /></button>}
      </form>}
    </div>
  </section>
}
