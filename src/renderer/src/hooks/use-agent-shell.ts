import { useEffect, useState } from 'react'
import { emptyShellState, type AgentShellState } from '../../../shared/shell'
import { platformApi } from '../platform-api'

export function useAgentShell(): AgentShellState {
  const [state, setState] = useState(emptyShellState)
  useEffect(() => {
    let active = true
    const update = (next: AgentShellState): void => { if (active) setState((previous) => next.revision >= previous.revision ? next : previous) }
    const unsubscribe = platformApi.onShellState(update)
    void platformApi.getShellState().then(update).catch(() => {})
    return () => { active = false; unsubscribe() }
  }, [])
  return state
}
