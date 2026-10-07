import { contextBridge, ipcRenderer } from 'electron'
import type { AlertEvent, AppSettings, FinPetApi, ProviderStatus, QuoteTick } from '../shared/types'
import type { ChatState } from '../shared/chat'

const api: FinPetApi = {
  getChatState: () => ipcRenderer.invoke('chat:state'),
  configureChat: (input) => ipcRenderer.invoke('chat:configure', input),
  listChatModels: () => ipcRenderer.invoke('chat:models'),
  checkChatConnection: () => ipcRenderer.invoke('chat:check'),
  openChatKeyPage: () => ipcRenderer.invoke('chat:key-page'),
  sendChat: (text) => ipcRenderer.invoke('chat:send', text),
  cancelChat: () => ipcRenderer.invoke('chat:cancel'),
  clearChat: () => ipcRenderer.invoke('chat:clear'),
  onChatState: (listener) => subscribe<ChatState>('chat:changed', listener),
  getSnapshot: () => ipcRenderer.invoke('app:snapshot'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  togglePanel: () => ipcRenderer.invoke('window:toggle-panel'),
  setClickThrough: (enabled) => ipcRenderer.invoke('window:set-click-through', enabled),
  setInteractiveRegions: (regions) => ipcRenderer.invoke('window:set-interactive-regions', regions),
  startWindowDrag: (x, y) => ipcRenderer.invoke('window:drag-start', x, y),
  moveWindowDrag: (x, y) => ipcRenderer.invoke('window:drag-move', x, y),
  endWindowDrag: () => ipcRenderer.invoke('window:drag-end'),
  getMateEngineStatus: () => ipcRenderer.invoke('mate-engine:status'),
  startMateEngine: () => ipcRenderer.invoke('mate-engine:start'),
  stopMateEngine: () => ipcRenderer.invoke('mate-engine:stop'),
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
