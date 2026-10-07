import { Bell, ChartNoAxesCombined, Clapperboard, Ellipsis, KeyRound, MessageCircle, NotebookPen, PiggyBank, Settings2, X } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import type { AppSettings, MarketProvider, ProviderStatus, QuoteTick } from '../../../shared/types'
import { AlertPanel } from './AlertPanel'
import { MarketChart } from './MarketChart'
import { PreferencesDialog } from './PreferencesDialog'
import { brand } from '../../../shared/brand'
import { DialoguePanel } from './DialoguePanel'
import { ChatConfigDialog } from './ChatConfigDialog'
import type { DebbyChatController } from '../hooks/use-debby-chat'

interface DashboardProps {
  settings: AppSettings
  quotes: QuoteTick[]
  provider: MarketProvider
  providerName: string
  providerStatus: ProviderStatus
  onSelect: (symbol: string) => void
  onSettings: (patch: Partial<AppSettings>) => void
  onAddAlert: (symbol: string, direction: 'above' | 'below', target: number) => void
  onRemoveAlert: (id: string) => void
  onProviderUrl: (url: string) => void
  showcasing: boolean
  onShowcase: () => void
  onRecap: () => void
  recapAvailable: boolean
  showcaseControls?: ReactNode
  onClose: () => void
  chat: DebbyChatController
  onDialogueChange: (active: boolean) => void
}

export function Dashboard({ settings, quotes, provider, providerName, providerStatus, onSelect, onSettings, onAddAlert, onRemoveAlert, onProviderUrl, showcasing, onShowcase, onRecap, recapAvailable, showcaseControls, onClose, chat, onDialogueChange }: DashboardProps): React.JSX.Element {
  const selected = quotes.find((quote) => quote.symbol === settings.selectedSymbol) ?? quotes[0]
  const positive = (selected?.changePct ?? 0) >= 0
  const [tab, setTab] = useState<'market' | 'alerts' | 'chat'>('market')
  const [chatConfig, setChatConfig] = useState(false)
  const chooseTab = (next: typeof tab): void => { setTab(next); onDialogueChange(next === 'chat') }
  const [preferences, setPreferences] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const optionsRef = useRef<HTMLDivElement>(null)
  return (
    <main className="dashboard-shell no-drag">
      <header className="panel-titlebar">
        <div className="brand-block" title={brand.fullName}><PiggyBank size={22} /><strong>{brand.name}</strong></div>
        <div className="panel-navigation">
          <div className="panel-tabs" role="tablist" aria-label="面板视图" onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            const tabs = ['market', 'alerts', 'chat'] as const
            const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 2)) % 3]
            chooseTab(next)
            document.getElementById(`tab-${next}`)?.focus()
          }}>
            <button id="tab-market" role="tab" tabIndex={tab === 'market' ? 0 : -1} aria-selected={tab === 'market'} aria-controls="market-view" onClick={() => chooseTab('market')}><ChartNoAxesCombined size={14} />行情</button>
            <button id="tab-alerts" role="tab" tabIndex={tab === 'alerts' ? 0 : -1} aria-selected={tab === 'alerts'} aria-controls="alerts-view" onClick={() => chooseTab('alerts')}><Bell size={14} />提醒{settings.alerts.length > 0 && <small>{settings.alerts.length}</small>}</button>
            <button id="tab-chat" role="tab" tabIndex={tab === 'chat' ? 0 : -1} aria-selected={tab === 'chat'} aria-controls="chat-view" onClick={() => chooseTab('chat')}><MessageCircle size={14} />对话</button>
          </div>
          <div className="header-actions">
            <button className="ghost-icon" title="行情复盘" onClick={onRecap} disabled={!recapAvailable}><NotebookPen size={17} /></button>
            <button className="ghost-icon" popoverTarget="panel-options" title="面板选项" aria-expanded={optionsOpen}><Ellipsis size={18} /></button>
            <button className="ghost-icon" title="收起行情面板" onClick={() => { onDialogueChange(false); onClose() }}><X size={17} /></button>
          </div>
        </div>
      </header>
      <div ref={optionsRef} id="panel-options" popover="auto" className="panel-options no-drag" role="dialog" aria-label="面板选项" onToggle={(event) => setOptionsOpen((event.nativeEvent as ToggleEvent).newState === 'open')}>
        <button className="menu-command" title={showcasing ? '退出演示' : '打开演示'} onClick={() => { optionsRef.current?.hidePopover(); onShowcase() }}><Clapperboard size={16} /><span>{showcasing ? '退出演示' : '场景演示'}</span></button>
        <button className="menu-command" title="偏好设置" onClick={() => { optionsRef.current?.hidePopover(); setPreferences(true) }}><Settings2 size={16} /><span>偏好设置</span></button>
        <button className="menu-command" title="BYOK 配置" disabled={chat.state.busy} onClick={() => { optionsRef.current?.hidePopover(); setChatConfig(true) }}><KeyRound size={16} /><span>BYOK</span></button>
      </div>
      <aside className="watchlist-pane">
        <div className="watchlist-heading"><span>自选</span><small>{quotes.length}</small></div>
        <nav className="watchlist" aria-label="自选行情">
          {quotes.length === 0 && <p className="empty-state">{providerStatus === 'offline' ? '暂无可用行情' : '正在获取行情'}</p>}
          {quotes.map((quote) => <button key={quote.symbol} data-symbol={quote.symbol} aria-current={quote.symbol === selected?.symbol ? 'true' : undefined} className={quote.symbol === selected?.symbol ? 'active' : ''} onClick={() => onSelect(quote.symbol)}>
            <div><strong>{quote.name}</strong><span>{quote.symbol}</span></div>
            <div className={quote.changePct >= 0 ? 'price-up' : 'price-down'}><strong>{quote.price.toFixed(quote.price > 1000 ? 2 : 3)}</strong><span>{quote.changePct >= 0 ? '+' : ''}{quote.changePct.toFixed(2)}%</span></div>
          </button>)}
        </nav>
        <div className="connection-status"><i className={providerStatus} /><div><strong>{providerName}</strong><span>{providerStatus === 'live' ? '已连接' : providerStatus === 'connecting' ? '正在连接' : providerStatus === 'offline' ? '离线 · 最近行情' : '演示数据 · 非实盘'}</span></div></div>
      </aside>

      <section className={'market-workspace' + (tab === 'chat' ? ' dialogue-workspace' : '')}>
        {showcaseControls && tab !== 'chat' && <div className="workspace-tools">{showcaseControls}</div>}
        <div id="market-view" role="tabpanel" aria-labelledby="tab-market" hidden={tab !== 'market'} className="market-view">
          <header className="workspace-header"><div><h1>{selected?.name ?? '行情'}</h1><span className="symbol-label">{selected?.symbol}</span></div><span className={'market-status' + (provider === 'demo' ? ' is-demo' : '')}>{provider === 'demo' ? '演示数据' : !selected ? '等待行情' : selected.status === 'offline' ? '离线缓存' : selected.status === 'closed' ? '已休市' : '交易中'}</span></header>
          <div className="quote-strip"><div className="quote-main"><strong>{selected?.price.toFixed((selected?.price ?? 0) > 1000 ? 2 : 3) ?? '--'}</strong><span className={positive ? 'price-up' : 'price-down'}>{positive ? '+' : ''}{selected?.change.toFixed(2) ?? '--'} <span>/</span> {positive ? '+' : ''}{selected?.changePct.toFixed(2) ?? '--'}%</span></div></div>
          <div className="quote-meta"><span>昨收<strong>{selected?.previousClose.toFixed(2) ?? '--'}</strong></span><span>涨跌幅<strong className={positive ? 'price-up' : 'price-down'}>{selected ? `${positive ? '+' : ''}${selected.changePct.toFixed(2)}%` : '--'}</strong></span><span>行情时间<strong>{selected ? new Date(selected.timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '--'}</strong></span></div>
          <MarketChart quote={selected} />
          <footer className="market-footnote"><span>{provider === 'demo' ? '演示数据 · 非实盘' : providerName}</span><span>公开行情可能延迟，不构成投资建议。</span></footer>
        </div>
        <div id="alerts-view" role="tabpanel" aria-labelledby="tab-alerts" hidden={tab !== 'alerts'}>
          {showcasing ? <section className="showcase-status"><header className="section-heading"><div><h2>演示提醒</h2><p>非实盘</p></div><Clapperboard size={20} /></header><dl><div><dt>数据</dt><dd>合成行情</dd></div><div><dt>提醒</dt><dd>仅窗口内展示</dd></div><div><dt>系统通知</dt><dd>不由演示触发</dd></div><div><dt>实盘配置</dt><dd>保持不变</dd></div></dl></section> : <AlertPanel settings={settings} quotes={quotes} onAdd={onAddAlert} onRemove={onRemoveAlert} />}
        </div>
        <div id="chat-view" role="tabpanel" aria-labelledby="tab-chat" hidden={tab !== 'chat'}>
          <DialoguePanel chat={chat} showcasing={showcasing} onConfigure={() => setChatConfig(true)} />
        </div>
      </section>

      {preferences && <PreferencesDialog settings={settings} onSettings={onSettings} onProviderUrl={onProviderUrl} showcasing={showcasing} onClose={() => setPreferences(false)} />}
      {chatConfig && <ChatConfigDialog chat={chat} onClose={() => setChatConfig(false)} />}
    </main>
  )
}
