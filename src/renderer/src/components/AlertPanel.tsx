import { BellOff, BellPlus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AppSettings, QuoteTick } from '../../../shared/types'

interface AlertPanelProps {
  settings: AppSettings
  quotes: QuoteTick[]
  onAdd: (symbol: string, direction: 'above' | 'below', target: number) => void
  onRemove: (id: string) => void
}

export function AlertPanel({ settings, quotes, onAdd, onRemove }: AlertPanelProps): React.JSX.Element {
  const selected = quotes.find((quote) => quote.symbol === settings.selectedSymbol) ?? quotes[0]
  const [target, setTarget] = useState(() => selected?.price.toFixed(2) ?? '')
  const [direction, setDirection] = useState<'above' | 'below'>('above')

  useEffect(() => {
    setTarget(selected?.price.toFixed(2) ?? '')
  }, [selected?.symbol])


  return (
    <section className="alert-panel">
      <div className="section-heading">
        <div><h2>价格提醒</h2><p>{selected?.name ?? '等待行情'}<span className="symbol-label">{selected?.symbol}</span></p></div>
        <span className="count-label">{settings.alerts.length} 项</span>
      </div>
      <form className="alert-form" onSubmit={(event) => {
        event.preventDefault()
        const number = Number(target)
        if (selected && Number.isFinite(number) && number > 0) onAdd(selected.symbol, direction, number)
      }}>
        <select value={direction} onChange={(event) => setDirection(event.target.value as 'above' | 'below')} aria-label="提醒方向">
          <option value="above">突破</option><option value="below">跌破</option>
        </select>
        <input value={target} onChange={(event) => setTarget(event.target.value)} type="number" min="0.001" step="any" required inputMode="decimal" aria-label="目标价格" placeholder="目标价" />
        <button className="square-action" type="submit" title="添加提醒" disabled={!selected}><BellPlus size={17} /></button>
      </form>
      <div className="alert-list">
        {settings.alerts.length === 0 && <div className="empty-state"><BellOff size={28} /><p>暂无价格提醒</p></div>}
        {settings.alerts.map((alert) => {
          const quote = quotes.find((item) => item.symbol === alert.symbol)
          return <div className="alert-row" key={alert.id}>
            <div><strong>{quote?.name ?? alert.symbol}</strong><span>{alert.direction === 'above' ? '突破' : '跌破'} {alert.target.toFixed(2)}</span></div>
            <button className="ghost-icon" onClick={() => onRemove(alert.id)} title="删除提醒"><Trash2 size={15} /></button>
          </div>
        })}
      </div>
    </section>
  )
}
