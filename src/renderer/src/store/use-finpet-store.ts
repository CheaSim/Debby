import { create } from 'zustand'
import type { AlertEvent, AppSettings, PriceAlert, ProviderStatus, QuoteTick } from '../../../shared/types'
import { platformApi } from '../platform-api'

interface FinPetState {
  ready: boolean
  settings?: AppSettings
  quotes: QuoteTick[]
  provider: 'demo' | 'remote'
  providerStatus: ProviderStatus
  latestAlert?: AlertEvent
  initialize: () => Promise<() => void>
  selectSymbol: (symbol: string) => Promise<void>
  togglePanel: () => Promise<void>
  setClickThrough: (enabled: boolean) => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  addAlert: (alert: Omit<PriceAlert, 'id' | 'enabled'>) => Promise<void>
  removeAlert: (id: string) => Promise<void>
}

export const useFinPetStore = create<FinPetState>((set, get) => ({
  ready: false,
  quotes: [],
  provider: 'demo',
  providerStatus: 'demo',
  initialize: async () => {
    const snapshot = await platformApi.getSnapshot()
    set({ ...snapshot, ready: true })
    const disposeQuotes = platformApi.onQuotes((quotes) => set({ quotes }))
    const disposeSettings = platformApi.onSettings((settings) => set({ settings }))
    const disposeStatus = platformApi.onProviderStatus((providerStatus) => set({
      providerStatus,
      provider: providerStatus === 'demo' ? 'demo' : 'remote'
    }))
    const disposeAlert = platformApi.onAlert((latestAlert) => {
      set({ latestAlert })
      window.setTimeout(() => set((state) => state.latestAlert === latestAlert ? { latestAlert: undefined } : {}), 8_000)
    })
    return () => { disposeQuotes(); disposeSettings(); disposeStatus(); disposeAlert() }
  },
  selectSymbol: async (selectedSymbol) => {
    const settings = await platformApi.updateSettings({ selectedSymbol })
    set({ settings })
  },
  togglePanel: async () => { await platformApi.togglePanel() },
  setClickThrough: async (enabled) => { await platformApi.setClickThrough(enabled) },
  updateSettings: async (patch) => set({ settings: await platformApi.updateSettings(patch) }),
  addAlert: async (alert) => {
    const alerts = [...(get().settings?.alerts ?? []), { ...alert, id: crypto.randomUUID(), enabled: true }]
    set({ settings: await platformApi.updateSettings({ alerts }) })
  },
  removeAlert: async (id) => {
    const alerts = (get().settings?.alerts ?? []).filter((alert) => alert.id !== id)
    set({ settings: await platformApi.updateSettings({ alerts }) })
  }
}))
