import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { AppSettings } from '../shared/types'

export const defaultSettings: AppSettings = {
  selectedSymbol: '000001.SH',
  watchlist: ['000001.SH', '399001.SZ', '600519.SH', 'AAPL'],
  alwaysOnTop: true,
  launchAtLogin: false,
  clickThrough: false,
  soundEnabled: true,
  panelOpen: false,
  alerts: [
    { id: 'demo-alert', symbol: '600519.SH', direction: 'above', target: 1720, enabled: true }
  ]
}

export class SettingsStore {
  private value: AppSettings

  constructor(private readonly filePath: string) {
    this.value = this.load()
  }

  get(): AppSettings {
    return structuredClone(this.value)
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.value = { ...this.value, ...patch }
    this.save()
    return this.get()
  }

  private load(): AppSettings {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<AppSettings>
      return { ...defaultSettings, ...parsed }
    } catch {
      return structuredClone(defaultSettings)
    }
  }

  private save(): void {
    const temporaryPath = `${this.filePath}.tmp`
    writeFileSync(temporaryPath, JSON.stringify(this.value, null, 2), 'utf8')
    renameSync(temporaryPath, this.filePath)
  }
}
