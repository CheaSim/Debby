import { useEffect, useRef } from 'react'
import { AreaSeries, ColorType, createChart, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import type { QuoteTick } from '../../../shared/types'

export function MarketChart({ quote }: { quote?: QuoteTick }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const positive = (quote?.changePct ?? 0) >= 0
    const color = positive ? '#d75b6b' : '#218968'
    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: 242,
      layout: { background: { type: ColorType.Solid, color: '#ffffff' }, textColor: '#9a9da6', fontFamily: 'Segoe UI, sans-serif', fontSize: 10 },
      grid: { vertLines: { visible: false }, horzLines: { color: '#f1f2f5' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, visible: false },
      handleScale: false,
      handleScroll: false
    })
    const series = chart.addSeries(AreaSeries, {
      lineColor: color, topColor: `${color}20`, bottomColor: `${color}00`, lineWidth: 2,
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false
    })
    chartRef.current = chart
    seriesRef.current = series
    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null }
  }, [quote?.symbol])

  useEffect(() => {
    if (!quote || !seriesRef.current) return
    const base = Math.floor(quote.timestamp / 1000) - quote.sparkline.length
    seriesRef.current.setData(quote.sparkline.map((value, index) => ({ time: (base + index) as UTCTimestamp, value })))
    const color = quote.changePct >= 0 ? '#d75b6b' : '#218968'
    seriesRef.current.applyOptions({ lineColor: color, topColor: `${color}20`, bottomColor: `${color}00` })
    chartRef.current?.timeScale().fitContent()
  }, [quote])

  return <div className="chart-region"><div className="market-chart" ref={containerRef} aria-label={`${quote?.name ?? ''}采样价格`} />
    {(!quote || quote.sparkline.length < 2) && <span className="chart-state">{!quote ? '等待行情' : quote.status === 'closed' ? '休市 · 最新收盘价' : '采样中'}</span>}
    <span className="chart-caption">采样价格</span>
  </div>
}
