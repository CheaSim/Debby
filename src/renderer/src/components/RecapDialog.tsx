import { Copy, Download, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { recapText, type MarketRecap } from '../../../shared/recap'

function exportRecap(recap: MarketRecap): void {
  const canvas = document.createElement('canvas')
  canvas.width = 1000
  canvas.height = 480 + Math.min(recap.quotes.length, 8) * 62
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image export is unavailable')
  context.fillStyle = '#fcfdfb'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const text = (value: string, x: number, y: number, size: number, color: string, weight = 400): void => {
    context.font = `${weight} ${size}px "Microsoft YaHei", "Segoe UI", sans-serif`
    context.fillStyle = color
    context.fillText(value, x, y)
  }
  const fitText = (value: string, x: number, y: number, size: number, color: string, width: number): void => {
    let fitted = size
    while (fitted > 12) {
      context.font = `${fitted}px "Microsoft YaHei", "Segoe UI", sans-serif`
      if (context.measureText(value).width <= width) break
      fitted -= 1
    }
    text(value, x, y, fitted, color)
  }
  text('FinPet', 56, 74, 30, '#263b32', 700)
  if (recap.demo) text('演示数据 · 非实盘', 720, 72, 22, '#a26716', 700)
  text(recap.title, 56, 140, 36, '#20231f', 700)
  text(`${recap.date} ${recap.time} · 上海时间`, 56, 181, 20, '#777d75')
  text(`关注标的 ${Math.min(recap.quotes.length, 8)} / ${recap.quotes.length}`, 730, 180, 18, '#777d75')
  text(recap.index.name, 56, 248, 22, '#777d75')
  text(`${recap.index.changePct >= 0 ? '+' : ''}${recap.index.changePct.toFixed(2)}%`, 56, 311, 48, recap.index.changePct >= 0 ? '#c94b5e' : '#16855c', 700)
  recap.quotes.slice(0, 8).forEach((quote, index) => {
    const y = 371 + index * 62
    fitText(quote.name, 56, y, 23, '#303830', 430)
    text(quote.price.toFixed(2), 530, y, 24, '#303830')
    text(`${quote.changePct >= 0 ? '+' : ''}${quote.changePct.toFixed(2)}%`, 790, y, 24, quote.changePct >= 0 ? '#c94b5e' : '#16855c')
  })
  fitText(`来源：${recap.source}${recap.cached ? ' · 离线或延迟缓存' : ''}`, 56, canvas.height - 88, 18, '#777d75', 888)
  text('仅含已获取的关注标的。公开行情可能延迟，不构成投资建议。', 56, canvas.height - 48, 18, '#777d75')
  const link = document.createElement('a')
  link.download = `FinPet-${recap.demo ? 'demo-' : ''}${recap.date}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

export function RecapDialog({ recap, onClose }: { recap: MarketRecap; onClose: () => void }): React.JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = ref.current
    dialog?.showModal()
    return () => { dialog?.close(); previous?.focus() }
  }, [])
  return (
    <dialog ref={ref} className="recap-dialog no-drag" aria-labelledby="recap-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
      <header className="recap-header">
        <div><span className="eyebrow">{recap.demo ? '演示数据 · 非实盘' : 'FINPET'}{recap.cached ? ' · 缓存' : ''}</span><h2 id="recap-title">{recap.title}</h2><p>{recap.date} · {recap.time} 上海时间</p></div>
        <div className="recap-actions">
          <button className="icon-button" title={copied ? '复盘已复制' : '复制复盘文字'} onClick={() => { void navigator.clipboard.writeText(recapText(recap)).then(() => { setCopied(true); setError(false) }, () => setError(true)) }}><Copy size={17} /></button>
          <button className="icon-button" title="导出复盘图片" onClick={() => { try { exportRecap(recap); setError(false) } catch { setError(true) } }}><Download size={17} /></button>
          <button className="icon-button" title="关闭复盘" onClick={onClose}><X size={17} /></button>
        </div>
      </header>
      <div className="recap-benchmark"><span>{recap.index.name}</span><strong className={recap.index.changePct >= 0 ? 'price-up' : 'price-down'}>{recap.index.changePct >= 0 ? '+' : ''}{recap.index.changePct.toFixed(2)}%</strong><span>{recap.index.price.toFixed(2)}</span></div>
      <div className="recap-counts"><span>关注标的</span><span className="price-up">涨 {recap.rising}</span><span className="price-down">跌 {recap.falling}</span><span>平 {recap.unchanged}</span></div>
      <div className="recap-table">
        {recap.quotes.map((quote) => <div key={quote.symbol}><span><strong>{quote.name}</strong><small>{quote.symbol}</small></span><span>{quote.price.toFixed(2)}</span><strong className={quote.changePct >= 0 ? 'price-up' : 'price-down'}>{quote.changePct >= 0 ? '+' : ''}{quote.changePct.toFixed(2)}%</strong></div>)}
      </div>
      <footer><strong>来源：{recap.source}</strong><p>仅含同一时段已获取的关注标的，不代表全市场涨跌分布。公开行情可能延迟，不构成投资建议。</p>{copied && <span role="status">复盘文字已复制</span>}{error && <span role="alert">导出失败，请稍后重试。</span>}</footer>
    </dialog>
  )
}
