import { useCallback, useEffect, useState } from 'react'
import { emptyChatState, type ChatApi, type ChatConfigInput, type ChatState } from '../../../shared/chat'
import { platformApi } from '../platform-api'

export function useDebbyChat(api: ChatApi = platformApi) {
  const [state, setState] = useState(emptyChatState)
  const [error, setError] = useState<string>()
  const accept = useCallback((next: ChatState) => setState((current) => next.revision >= current.revision ? next : current), [])
  useEffect(() => {
    let active = true
    const dispose = api.onChatState((next) => { if (active) accept(next) })
    void api.getChatState().then((next) => { if (active) accept(next) }).catch(() => { if (active) setError('无法连接对话服务。') })
    return () => { active = false; dispose() }
  }, [api, accept])
  const act = useCallback(async (action: () => Promise<unknown>) => {
    setError(undefined)
    try { await action(); return true } catch (failure) {
      const message = failure instanceof Error ? failure.message : '操作失败。'
      setError(message.replace(/^Error invoking remote method '[^']+': Error: /, ''))
      return false
    }
  }, [])
  return { state, error: error ?? state.error,
    send: (text: string) => act(() => api.sendChat(text)),
    cancel: () => act(api.cancelChat), clear: () => act(api.clearChat),
    configure: (input: ChatConfigInput) => act(async () => accept(await api.configureChat(input))),
    listModels: api.listChatModels, checkConnection: api.checkChatConnection, openKeyPage: api.openChatKeyPage }
}
export type DebbyChatController = ReturnType<typeof useDebbyChat>
