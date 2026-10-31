import { contextBridge, ipcRenderer } from 'electron'
import type { AlertEvent, AppSettings, FinPetApi, ProviderStatus, QuoteTick } from '../shared/types'
import type { ChatState } from '../shared/chat'
import type { ReadAloudStreamEvent, VoiceAudio, VoiceState } from '../shared/voice'
import type { AgentShellState } from '../shared/shell'
import type { DanceState } from '../shared/dance'
import type { AvatarCue } from '../shared/avatar'
import type { CursorPosition } from '../shared/avatar-gaze'

const api: FinPetApi = {
  getCursorPosition: () => ipcRenderer.invoke('window:cursor'),
  onCursorPosition: listener => subscribe<CursorPosition>('window:cursor-position', listener),
  onAvatarAction: listener => subscribe<AvatarCue>('avatar:action', listener),
  getDanceState: () => ipcRenderer.invoke('dance:state'),
  getDanceAsset: (id) => ipcRenderer.invoke('dance:asset', id),
  saveDance: (input) => ipcRenderer.invoke('dance:save', input),
  removeDance: (id) => ipcRenderer.invoke('dance:remove', id),
  controlDance: (command) => ipcRenderer.invoke('dance:control', command),
  onDanceState: (listener) => subscribe<DanceState>('dance:changed', listener),
  onDanceCaptureStop: (listener) => subscribe('dance:stop-capture', listener),
  readAloud: (input) => ipcRenderer.invoke('voice:read-aloud', input),
  streamReadAloud: (input) => ipcRenderer.invoke('voice:stream-read-aloud', input),
  onReadAloudAudio: (listener) => subscribe<ReadAloudStreamEvent>('voice:read-aloud-audio', listener),
  cancelReadAloud: () => ipcRenderer.invoke('voice:cancel-read-aloud'),
  onReadAloudStop: (listener) => subscribe('voice:read-aloud-stop', listener),
  getShellState: () => ipcRenderer.invoke('shell:state'),
  enableShell: (enabled) => ipcRenderer.invoke('shell:enable', enabled),
  cancelShellTask: () => ipcRenderer.invoke('shell:cancel'),
  releaseShell: () => ipcRenderer.invoke('shell:release'),
  previewShell: (advance) => ipcRenderer.invoke('shell:preview', advance),
  copyShellConfig: (format) => ipcRenderer.invoke('shell:copy-config', format),
  onShellState: (listener) => subscribe<AgentShellState>('shell:changed', listener),
  getVoiceState: () => ipcRenderer.invoke('voice:state'),
  configureVoice: (input) => ipcRenderer.invoke('voice:configure', input),
  startVoice: (input) => ipcRenderer.invoke('voice:start', input),
  setVoiceCamera: (allowed) => ipcRenderer.invoke('voice:set-camera', allowed),
  stopVoice: () => ipcRenderer.invoke('voice:stop'),
  authorizeVoiceMedia: (kind) => ipcRenderer.invoke('voice:authorize-media', kind),
  releaseVoiceMedia: (kind) => ipcRenderer.invoke('voice:release-media', kind),
  sendVoiceTurn: (turn) => ipcRenderer.invoke('voice:turn', turn),
  interruptVoice: () => ipcRenderer.invoke('voice:interrupt'),
  clearVoice: () => ipcRenderer.invoke('voice:clear'),
  onVoiceState: (listener) => subscribe<VoiceState>('voice:changed', listener),
  onVoiceAudio: (listener) => subscribe<VoiceAudio>('voice:audio', listener),
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
