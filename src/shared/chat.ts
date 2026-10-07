export const defaultChatModel = 'openrouter/free'

export interface ChatModel { id: string; name: string; contextLength: number }
export interface ChatConfig {
  configured: boolean
  modelId: string
  cloudConsent: boolean
  storage: 'encrypted' | 'none'
}
export interface ChatConfigInput { apiKey?: string; modelId: string; cloudConsent: boolean; removeKey?: boolean }
export interface ChatLine {
  id: string
  role: 'user' | 'assistant'
  text: string
  status: 'streaming' | 'done' | 'cancelled' | 'error'
  timestamp: number
}
export interface ChatState {
  revision: number
  config: ChatConfig
  messages: ChatLine[]
  busy: boolean
  activeTool?: string
  error?: string
}
export interface ChatApi {
  getChatState: () => Promise<ChatState>
  configureChat: (input: ChatConfigInput) => Promise<ChatState>
  listChatModels: () => Promise<ChatModel[]>
  checkChatConnection: () => Promise<string>
  openChatKeyPage: () => Promise<void>
  sendChat: (text: string) => Promise<void>
  cancelChat: () => Promise<void>
  clearChat: () => Promise<void>
  onChatState: (listener: (state: ChatState) => void) => () => void
}

export function emptyChatState(): ChatState {
  return { revision: 0, config: { configured: false, modelId: defaultChatModel, cloudConsent: false, storage: 'none' }, messages: [], busy: false }
}
