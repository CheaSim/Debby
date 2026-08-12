import { Bell, Pin, Power, Radio, Volume2 } from 'lucide-react'
import type { AppSettings, ProviderStatus, QuoteTick } from '../../../shared/types'
import { AlertPanel } from './AlertPanel'
import { MarketChart } from './MarketChart'

interface DashboardProps {
  settings: AppSettings
  quotes: QuoteTick[]
  provider: 'demo' | 'remote'
  providerStatus: ProviderStatus
  onSelect: (symbol: string) => void
  onSettings: (patch: Partial<AppSettings>) => void
  onAddAlert: (symbol: string, direction: 'above' | 'below', target: number) => void
  onRemoveAlert: (id: string) => void
  onProviderUrl: (url: string) => void
}

export function Dashboard({ settings, quotes, provider, providerStatus, onSelect, onSettings, onAddAlert, onRemoveAlert, onProviderUrl }: DashboardProps): React.JSX.Element {
  const selected = quotes.find((quote) => quote.symbol === settings.selectedSymbol) ?? quotes[0]
  const positive = (selected?.changePct ?? 0) >= 0
  return (
    <main className="dashboard-shell no-drag">
      <aside className="watchlist-pane">
        <header className="brand-block"><span className="brand-mark">F</span><div><strong>FinPet</strong><span>MARKET DESK</span></div></header>
        <div className="watchlist-heading"><span>自选市场</span><small>{quotes.length}</small></div>
        <nav className="watchlist">
          {quotes.map((quote) => <button key={quote.symbol} data-symbol={quote.symbol} className={quote.symbol === selected?.symbol ? 'active' : ''} onClick={() => onSelect(quote.symbol)}>
            <div><strong>{quote.name}</strong><span>{quote.symbol}</span></div>
            <div className={quote.changePct >= 0 ? 'price-up' : 'price-down'}><strong>{quote.price.toFixed(quote.price > 1000 ? 2 : 3)}</strong><span>{quote.changePct >= 0 ? '+' : ''}{quote.changePct.toFixed(2)}%</span></div>
          </button>)}
        </nav>
        <div className="connection-status"><i className={providerStatus} /><div><strong>{provider === 'remote' ? '实时行情' : '演示行情'}</strong><span>{providerStatus === 'live' ? '已连接数据服务' : providerStatus === 'connecting' ? '正在连接行情' : providerStatus === 'offline' ? '连接中断，正在重试' : '本地模拟数据'}</span></div><Radio size={16} /></div>
      </aside>

      <section className="market-workspace">
        <header className="workspace-header">
          <div><span className="eyebrow">MARKET OVERVIEW</span><h1>{selected?.name ?? '行情面板'}</h1><span className="symbol-label">{selected?.symbol}</span></div>
          <div className="header-actions">
            <label title="声音提醒"><Volume2 size={16} /><input type="checkbox" checked={settings.soundEnabled} onChange={(event) => onSettings({ soundEnabled: event.target.checked })} /><i /></label>
            <label title="总在最前"><Pin size={16} /><input type="checkbox" checked={settings.alwaysOnTop} onChange={(event) => onSettings({ alwaysOnTop: event.target.checked })} /><i /></label>
            <label title="开机启动"><Power size={16} /><input type="checkbox" checked={settings.launchAtLogin} onChange={(event) => onSettings({ launchAtLogin: event.target.checked })} /><i /></label>
          </div>
        </header>

        <div className="quote-strip">
          <div className={positive ? 'quote-main price-up' : 'quote-main price-down'}><strong>{selected?.price.toFixed((selected?.price ?? 0) > 1000 ? 2 : 3) ?? '--'}</strong><span>{positive ? '+' : ''}{selected?.change.toFixed(2)} / {positive ? '+' : ''}{selected?.changePct.toFixed(2)}%</span></div>
          <div className="quote-meta"><span>昨收<strong>{selected?.previousClose.toFixed(2)}</strong></span><span>状态<strong>交易中</strong></span><span>更新时间<strong>{selected ? new Date(selected.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) : '--'}</strong></span></div>
        </div>
        <MarketChart quote={selected} />
        <div className="insight-band"><Bell size={17} /><div><strong>财仔观察</strong><span>{positive ? '当前价格高于昨收，保持计划内观察。' : '当前价格低于昨收，注意风险敞口。'} 数据为演示用途，不构成投资建议。</span></div></div>
      </section>

      <AlertPanel settings={settings} quotes={quotes} onAdd={onAddAlert} onRemove={onRemoveAlert} onProviderUrl={onProviderUrl} />
    </main>
  )
}
