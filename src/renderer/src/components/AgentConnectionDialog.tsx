import { Cable, Check, Copy, Play, Square, Unplug, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { AgentShellState } from '../../../shared/shell'
import { platformApi } from '../platform-api'

export const agentStatusLabel = { working: '进行中', waiting: '等待你', completed: '已完成', error: '遇到问题', cancelled: '已取消' }
export function AgentConnectionDialog({ state, onClose }: { state: AgentShellState; onClose: () => void }): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [format, setFormat] = useState<'json' | 'codex'>('json')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.showModal()
    return () => { ref.current?.close(); previous?.focus() }
  }, [])
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setError(''); setBusy(true)
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试。') }
    finally { setBusy(false) }
  }
  const active = state.task && ['working', 'waiting'].includes(state.task.status)
  return <dialog ref={ref} className="preferences-dialog agent-dialog no-drag" aria-labelledby="agent-dialog-title" onCancel={(e) => { e.preventDefault(); onClose() }}>
    <header className="dialog-heading"><h2 id="agent-dialog-title">Agent 接入</h2><button className="ghost-icon" title="关闭 Agent 接入" onClick={onClose}><X size={18} /></button></header>
    <p className="agent-intro">让你喜欢的 Agent，成为 Debby 的灵魂。</p>
    <section className="preferences-section">
      <label className="switch-row"><Cable size={17} /><span>允许本机 Agent 接入</span><input aria-label="允许本机 Agent 接入" type="checkbox" checked={state.enabled} disabled={busy} onChange={(e) => void run(() => platformApi.enableShell(e.target.checked))} /><i /></label>
      <p className="settings-status">{state.enabled ? '已开启 · 仅本机连接，退出 Debby 后关闭' : '开启后，通过同一套 MCP 连接你的 Agent。'}</p>
    </section>
    <section className="agent-connection-card" aria-live="polite">
      <div className="agent-connection-heading"><span className={'agent-dot ' + (state.controller ? 'connected' : '')} /><strong>{state.controller?.name ?? '等待与你的 Agent 相遇'}</strong><small>{state.controller?.preview ? '演示 · 无真实任务' : state.controller ? '已连接' : state.enabled ? '可连接' : '未开启'}</small></div>
      {state.task ? <><div className="agent-task-detail"><span>{agentStatusLabel[state.task.status]}</span><strong>{state.task.title}</strong></div>{state.task.progress !== undefined && <progress aria-label="Agent 任务进度" value={state.task.progress} max={1} />}<p className="agent-full-caption">{state.caption?.text || 'Debby 正在陪你一起完成。'}</p></> : <p className="settings-status">任务进度、等待确认、完成庆祝，都交给 Debby 告诉你。</p>}
      <div className="agent-card-actions">
        {active && <button disabled={busy} onClick={() => void run(platformApi.cancelShellTask)}><Square size={13} />取消任务</button>}
        {state.controller && <button disabled={busy} onClick={() => void run(platformApi.releaseShell)}><Unplug size={14} />{state.controller.preview ? '结束演示' : '断开连接'}</button>}
      </div>
    </section>
    <label className="agent-format">接入客户端<select aria-label="MCP 配置格式" value={format} onChange={(e) => { setFormat(e.target.value as typeof format); setCopied(false) }}><option value="json">通用 JSON · Claude Code / Harness</option><option value="codex">Codex · TOML</option></select></label>
    <div className="agent-setup-actions">
      <button className="agent-primary" disabled={busy} onClick={() => void run(async () => { await platformApi.copyShellConfig(format); setCopied(true) })}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? '已复制 MCP 配置' : '复制 MCP 配置'}</button>
      <button disabled={busy || Boolean(state.controller && !state.controller.preview)} onClick={() => void run(() => platformApi.previewShell(state.controller?.preview && state.task?.status === 'waiting'))}><Play size={14} />{state.controller?.preview && state.task?.status === 'waiting' ? '继续演示' : '体验一下'}</button>
    </div>
    <p className="agent-hint">{format === 'codex' ? '将配置合并到 Codex 的 config.toml，再重启 MCP 连接。' : '将配置合并到客户端的 MCP 配置，再重启其 MCP 连接。'}同名条目请替换，保留其他配置。</p>
    {state.task?.status === 'cancelled' && <p className="settings-status">已发出取消状态。接入方需读取状态，并停止自己的任务。</p>}
    {error && <p className="provider-error" role="alert">{error}</p>}
  </dialog>
}
