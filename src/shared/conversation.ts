import type { ChatState } from './chat'

export interface ConversationImage { type: 'image'; data: string; mimeType: 'image/jpeg' }
export interface ConversationBackend {
  getState: () => ChatState
  send: (text: string, images?: ConversationImage[]) => Promise<void>
  waitForIdle: () => Promise<void>
  cancel: () => void
  clear: () => Promise<void>
}
export interface ConversationHost {
  systemPrompt: string
  onState: (state: ChatState) => void
}
