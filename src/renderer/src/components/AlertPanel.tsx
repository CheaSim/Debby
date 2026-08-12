import { BellPlus, Save, ServerCog, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { isAllowedMarketDataUrl } from '../../../shared/domain'
import type { AppSettings, QuoteTick } from '../../../shared/types'

interface AlertPanelProps {
  settings: AppSettings
  quotes: QuoteTick[]
  onAdd: (symbol: string, direction: 'above' | 'below', target: number) => void
  onRemove: (id: string) => void
  onProviderUrl: (url: string) => void
}

export function AlertPanel({ settings, quotes, onAdd, onRemove, onProviderUrl }: AlertPanelProps): React.JSX.Element {
  const selected = quotes.find((quote) => quote.symbol === settings.selectedSymbol) ?? quotes[0]
  const [target, setTarget] = useState(() => selected?.price.toFixed(2) ?? '')
  const [direction, setDirection] = useState<'above' | 'below'>('above')
  const [providerUrl, setProviderUrl] = useState(settings.marketDataUrl ?? '')
  const [providerError, setProviderError] = useState('')

  useEffect(() => {
    setTarget(selected?.price.toFixed(2) ?? '')
  }, [selected?.symbol])

  useEffect(() => setProviderUrl(settings.marketDataUrl ?? ''), [settings.marketDataUrl])

  return (
    <section className="alert-panel">
      <div className="section-heading">
        <div><span className="eyebrow">ALERTS</span><h2>价格提醒</h2></div>
        <span className="count-label">{settings.alerts.length}</span>
      </div>
      <form className="alert-form" onSubmit={(event) => {
        event.preventDefault()
        const number = Number(target)
        if (selected && Number.isFinite(number) && number > 0) onAdd(selected.symbol, direction, number)
      }}>
        <select value={direction} onChange={(event) => setDirection(event.target.value as 'above' | 'below')} aria-label="提醒方向">
          <option value="above">突破</option><option value="below">跌破</option>
        </select>
        <input value={target} onChange={(event) => setTarget(event.target.value)} inputMode="decimal" aria-label="目标价格" placeholder="目标价" />
        <button className="square-action" type="submit" title="添加提醒"><BellPlus size={17} /></button>
      </form>
      <div className="alert-list">
        {settings.alerts.length === 0 && <p className="empty-state">暂无提醒</p>}
        {settings.alerts.map((alert) => {
          const quote = quotes.find((item) => item.symbol === alert.symbol)
          return <div className="alert-row" key={alert.id}>
            <div><strong>{quote?.name ?? alert.symbol}</strong><span>{alert.direction === 'above' ? '突破' : '跌破'} {alert.target.toFixed(2)}</span></div>
            <button className="ghost-icon" onClick={() => onRemove(alert.id)} title="删除提醒"><Trash2 size={15} /></button>
          </div>
        })}
      </div>
      <div className="provider-settings">
        <div className="provider-title"><ServerCog size={16} /><strong>行情中继</strong></div>
        <form onSubmit={(event) => {
          event.preventDefault()
          if (!isAllowedMarketDataUrl(providerUrl)) {
            setProviderError('请使用 wss://；明文 ws:// 仅限本机')
            return
          }
          setProviderError('')
          onProviderUrl(providerUrl.trim())
        }}>
          <input value={providerUrl} onChange={(event) => setProviderUrl(event.target.value)} placeholder="wss://...（留空使用演示源）" aria-label="行情中继地址" />
          <button className="square-action" type="submit" title="保存行情源"><Save size={16} /></button>
        </form>
        {providerError && <span className="provider-error">{providerError}</span>}
      </div>
    </section>
  )
}
