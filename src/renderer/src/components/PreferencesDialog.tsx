import { Pin, Power, Save, Volume2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { isAllowedMarketDataUrl } from '../../../shared/domain'
import type { AppSettings, MarketProvider } from '../../../shared/types'
import { brand } from '../../../shared/brand'

interface PreferencesDialogProps {
  settings: AppSettings
  onSettings: (patch: Partial<AppSettings>) => void
  onProviderUrl: (url: string) => void
  onClose: () => void
  showcasing: boolean
}

export function PreferencesDialog({ settings, onSettings, onProviderUrl, onClose, showcasing }: PreferencesDialogProps): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const [providerUrl, setProviderUrl] = useState(settings.marketDataUrl ?? '')
  const [providerError, setProviderError] = useState('')
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current
    dialog?.showModal()
    return () => { dialog?.close(); previous?.focus() }
  }, [])
  useEffect(() => setProviderUrl(settings.marketDataUrl ?? ''), [settings.marketDataUrl])
  return (
    <dialog ref={ref} className="preferences-dialog no-drag" aria-labelledby="preferences-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
      <header className="dialog-heading"><h2 id="preferences-title">偏好设置</h2><button className="ghost-icon" title="关闭偏好设置" onClick={onClose}><X size={18} /></button></header>
      <section className="preferences-section"><h3>桌面</h3>
        <label className="switch-row" title="声音提醒"><Volume2 size={17} /><span>声音提醒</span><input type="checkbox" checked={settings.soundEnabled} onChange={(event) => onSettings({ soundEnabled: event.target.checked })} /><i /></label>
        <label className="switch-row" title="总在最前"><Pin size={17} /><span>总在最前</span><input type="checkbox" checked={settings.alwaysOnTop} onChange={(event) => onSettings({ alwaysOnTop: event.target.checked })} /><i /></label>
        <label className="switch-row" title="开机启动"><Power size={17} /><span>开机启动</span><input type="checkbox" checked={settings.launchAtLogin} onChange={(event) => onSettings({ launchAtLogin: event.target.checked })} /><i /></label>
      </section>
      <section className="preferences-section provider-settings"><h3>行情源</h3>
        <select aria-label="行情源" value={settings.marketSource} disabled={!window.finpet || showcasing} onChange={(event) => { setProviderError(''); onSettings({ marketSource: event.target.value as MarketProvider }) }}>
          <option value="public">公开行情 · 腾讯 / 新浪</option><option value="remote">自定义 WebSocket 中继</option><option value="demo">演示行情</option>
        </select>
        {showcasing && <p className="settings-status">演示中 · 实盘配置保持不变</p>}
        {settings.marketSource === 'remote' && <form onSubmit={(event) => {
          event.preventDefault()
          if (!isAllowedMarketDataUrl(providerUrl)) { setProviderError('请使用 wss://；明文 ws:// 仅限本机'); return }
          setProviderError('')
          onProviderUrl(providerUrl.trim())
        }}>
          <input value={providerUrl} disabled={showcasing} onChange={(event) => setProviderUrl(event.target.value)} placeholder="wss://..." aria-label="行情中继地址" />
          <button className="square-action" disabled={showcasing} type="submit" title="保存行情源"><Save size={16} /></button>
        </form>}
        {providerError && <p className="provider-error" role="alert">{providerError}</p>}
      </section>
      <footer className="preferences-brand"><strong>{brand.name}</strong><span>{brand.fullName}</span></footer>
    </dialog>
  )
}
