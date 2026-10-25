/** Public avatar contract. No provider credentials or device permissions cross this boundary. */
export type AgentTaskStatus = 'working' | 'waiting' | 'completed' | 'error' | 'cancelled'
export type { AvatarAction as AgentAction } from './avatar'
import type { AvatarAction as AgentAction } from './avatar'
export interface AgentShellState {
  revision: number
  enabled: boolean
  controller?: { name: string; preview: boolean }
  task?: { id: string; title: string; status: AgentTaskStatus; progress?: number }
  caption?: { turnId: string; text: string; done: boolean }
  action?: { id: number; name: AgentAction }
}
export const emptyShellState = (): AgentShellState => ({ revision: 0, enabled: false })
export interface AgentShellApi {
  getShellState(): Promise<AgentShellState>
  enableShell(enabled: boolean): Promise<AgentShellState>
  cancelShellTask(): Promise<void>
  releaseShell(): Promise<void>
  previewShell(advance?: boolean): Promise<void>
  copyShellConfig(format?: 'json' | 'codex'): Promise<void>
  onShellState(listener: (state: AgentShellState) => void): () => void
}
