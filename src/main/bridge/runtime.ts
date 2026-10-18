import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { emptyShellState, type AgentAction, type AgentShellState } from '../../shared/shell'

const id = z.string().regex(/^[\w.-]{1,80}$/)
const text = (max: number) => z.string().trim().min(1).max(max).refine((v) => !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))
export const sessionSchema = z.object({ name: text(48) }).strict()
const base = { sessionId: z.string().uuid(), seq: z.number().int().positive(), taskId: id }
export const eventSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('task'), title: text(100), status: z.enum(['working', 'waiting', 'completed', 'error']), progress: z.number().min(0).max(1).optional() }).strict(),
  z.object({ ...base, type: z.literal('say'), turnId: id, text: text(2000), append: z.boolean().default(false), done: z.boolean().default(true) }).strict(),
  z.object({ ...base, type: z.literal('animate'), name: z.enum(['greet', 'celebrate', 'comfort', 'notify']) }).strict()
])
export class BridgeError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** Transport independent single-controller state machine; clock injected for lease tests. */
export class ShellRuntime {
  private state = emptyShellState()
  private owner?: { id: string; seq: number; expires: number }
  private taskIds = new Set<string>()
  private turnIds = new Set<string>()
  private actionId = 0
  constructor(private changed: (state: AgentShellState) => void, private now = Date.now) {}
  snapshot(): AgentShellState {
    if (this.owner && this.owner.expires <= this.now()) this.release()
    return structuredClone(this.state)
  }
  private publish(): void { this.state.revision++; this.changed(structuredClone(this.state)) }
  enabled(enabled: boolean): void {
    this.release()
    this.state.enabled = enabled
    this.publish()
  }
  claim(input: unknown): { sessionId: string; leaseMs: number } {
    const { name } = sessionSchema.parse(input)
    this.snapshot()
    if (!this.state.enabled) throw new BridgeError(503, '请在 Debby 中开启 Agent 接入。')
    if (this.state.controller) throw new BridgeError(409, 'Debby 已由其他 Agent 控制，请先在桌宠中断开。')
    this.owner = { id: randomUUID(), seq: 0, expires: this.now() + 120_000 }
    this.state.controller = { name, preview: false }
    this.publish()
    return { sessionId: this.owner.id, leaseMs: 120_000 }
  }
  private authorize(sessionId: string): void {
    this.snapshot()
    if (!this.owner || this.owner.id !== sessionId) throw new BridgeError(409, '控制会话已结束，请重新连接。')
  }
  heartbeat(sessionId: string): void { this.authorize(sessionId); this.owner!.expires = this.now() + 120_000 }
  release(sessionId?: string): void {
    if (sessionId) this.authorize(sessionId)
    this.owner = undefined
    this.taskIds.clear(); this.turnIds.clear()
    this.state = { revision: this.state.revision, enabled: this.state.enabled }
    this.publish()
  }
  cancel(): void {
    if (!this.state.task || ['completed', 'error', 'cancelled'].includes(this.state.task.status)) return
    this.state.task.status = 'cancelled'
    this.state.caption = undefined
    this.state.action = undefined
    this.publish()
  }
  event(input: unknown): AgentShellState {
    const event = eventSchema.parse(input)
    this.authorize(event.sessionId)
    if (event.seq <= this.owner!.seq) throw new BridgeError(409, '消息序号已过期。')
    if (event.type === 'task' && event.taskId !== this.state.task?.id) {
      if (this.taskIds.has(event.taskId)) throw new BridgeError(409, '任务已过期。')
      if (this.taskIds.size >= 256) throw new BridgeError(409, '请断开并创建新会话。')
      this.taskIds.add(event.taskId)
      this.state.task = undefined; this.state.caption = undefined; this.state.action = undefined
      this.turnIds.clear()
    } else {
      if (event.taskId !== this.state.task?.id) throw new BridgeError(409, '任务已过期。')
      if (this.state.task.status === 'cancelled') throw new BridgeError(409, '用户已取消任务，请停止工作。')
      if (event.type === 'task' && ['completed', 'error'].includes(this.state.task.status)) throw new BridgeError(409, '任务已结束，请使用新的 taskId。')
    }
    if (event.type === 'task') {
      const previousStatus = this.state.task?.status
      this.state.task = { id: event.taskId, title: event.title, status: event.status, progress: event.progress }
      const action = { working: 'greet', waiting: 'notify', completed: 'celebrate', error: 'comfort' } as const
      if (previousStatus !== event.status) this.animate(action[event.status])
    } else if (event.type === 'say') {
      const current = this.state.caption
      if (current?.turnId === event.turnId) {
        if (current.done) throw new BridgeError(409, '这段台词已结束。')
        const next = event.append ? current.text + event.text : event.text
        if (next.length > 2000) throw new BridgeError(400, '台词最多 2000 字符。')
        this.state.caption = { turnId: event.turnId, text: next, done: event.done }
      } else {
        if (this.turnIds.has(event.turnId)) throw new BridgeError(409, '台词已过期。')
        if (this.turnIds.size >= 256) throw new BridgeError(409, '台词过多，请创建新任务。')
        this.turnIds.add(event.turnId)
        this.state.caption = { turnId: event.turnId, text: event.text, done: event.done }
      }
    } else this.animate(event.name)
    this.owner!.seq = event.seq
    this.owner!.expires = this.now() + 120_000
    this.publish()
    return this.snapshot()
  }
  private animate(name: AgentAction): void { this.state.action = { id: ++this.actionId, name } }
  preview(advance = false): void {
    this.snapshot()
    if (this.owner) throw new BridgeError(409, '请先断开正在控制 Debby 的 Agent。')
    const previous = this.state.controller?.preview ? this.state.task?.status : undefined
    if (advance && previous !== 'waiting') throw new BridgeError(409, '当前没有等待继续的演示。')
    const status = advance ? 'completed' : previous === 'working' ? 'waiting' : 'working'
    this.state.controller = { name: '本地演示', preview: true }
    this.state.task = { id: 'preview', status, title: status === 'working' ? '正在整理你的项目' : status === 'waiting' ? '等待你确认下一步' : '做好啦，来看看吧', progress: status === 'working' ? .35 : status === 'waiting' ? .65 : 1 }
    this.state.caption = { turnId: 'preview', text: status === 'working' ? '我会把进度带给你，你可以安心做自己的事。' : status === 'waiting' ? '需要你的决定啦。点「继续演示」看看完成时的我。' : '任务完成！今天也一起向前了一小步。', done: true }
    this.animate(status === 'completed' ? 'celebrate' : status === 'waiting' ? 'notify' : 'greet')
    this.publish()
  }
}
