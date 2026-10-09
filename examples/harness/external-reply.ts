import { emptyChatState } from '../../src/shared/chat'
import type { ConversationBackend, ConversationHost, ConversationImage } from '../../src/shared/conversation'

export type HarnessReply = (input: { text: string; images?: ConversationImage[]; signal: AbortSignal }) => Promise<string | AsyncIterable<string>>

// Supply your reviewed harness client. This adapter never launches processes or loads plugins.
export class ExternalReplyBackend implements ConversationBackend {
  private state = emptyChatState()
  private controller?: AbortController
  private task?: Promise<void>
  constructor(private readonly host: ConversationHost, private readonly reply: HarnessReply) {}
  getState = () => structuredClone(this.state)
  private publish(): void {
    this.state.revision++
    try { this.host.onState(this.getState()) } catch { /* UI observers cannot own the external turn. */ }
  }
  async send(text: string, images?: ConversationImage[]): Promise<void> {
    if (this.state.busy) throw new Error('外部 Agent 正在回复。')
    if (!text.trim() || text.length > 4000) throw new Error('请输入 1 至 4000 字。')
    this.state.busy = true; this.state.error = undefined
    const controller = new AbortController(); this.controller = controller
    this.state.messages.push({ id: crypto.randomUUID(), role: 'user', text, status: 'done', timestamp: Date.now() })
    const line = { id: crypto.randomUUID(), role: 'assistant' as const, text: '', status: 'streaming' as 'streaming' | 'done' | 'cancelled' | 'error', timestamp: Date.now() }
    this.state.messages.push(line); this.state.messages = this.state.messages.slice(-32); this.publish()
    this.task = this.run(text, images, controller, line)
  }
  private async run(text: string, images: ConversationImage[] | undefined, controller: AbortController, line: { text: string; status: 'streaming' | 'done' | 'cancelled' | 'error' }): Promise<void> {
    try {
      const result = await this.reply({ text, images, signal: controller.signal })
      const chunks = typeof result === 'string' ? [result] : result
      for await (const chunk of chunks) {
        if (controller.signal.aborted) break
        if (typeof chunk !== 'string' || line.text.length + chunk.length > 8000) throw new Error('Invalid harness response')
        line.text += chunk; this.publish()
      }
      line.status = controller.signal.aborted ? 'cancelled' : 'done'
    } catch {
      line.status = controller.signal.aborted ? 'cancelled' : 'error'
      if (!controller.signal.aborted) this.state.error = '外部 Agent 暂时不可用。'
    } finally { this.state.busy = false; this.controller = undefined; this.publish() }
  }
  cancel = (): void => { this.controller?.abort() }
  waitForIdle = async (): Promise<void> => { await this.task }
  clear = async (): Promise<void> => {
    this.cancel(); await this.waitForIdle()
    this.state.messages = []; this.state.error = undefined; this.publish()
  }
}
