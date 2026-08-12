import { contextBridge, ipcRenderer } from 'electron'
import type { AlertEvent, AppSettings, FinPetApi, ProviderStatus, QuoteTick } from '../shared/types'

const api: FinPetApi = {
  getSnapshot: () => ipcRenderer.invoke('app:snapshot'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  togglePanel: () => ipcRenderer.invoke('window:toggle-panel'),
  setClickThrough: (enabled) => ipcRenderer.invoke('window:set-click-through', enabled),
  onQuotes: (listener) => subscribe<QuoteTick[]>('market:quotes', listener),
  onSettings: (listener) => subscribe<AppSettings>('settings:changed', listener),
  onProviderStatus: (listener) => subscribe<ProviderStatus>('market:status', listener),
  onAlert: (listener) => subscribe<AlertEvent>('alert:triggered', listener)
}

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

contextBridge.exposeInMainWorld('finpet', api)
