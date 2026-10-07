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
    const color = positive ? '#ef5b5b' : '#1d9b69'
    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: 242,
      layout: { background: { type: ColorType.Solid, color: '#ffffff' }, textColor: '#767a72', fontFamily: 'Inter, Segoe UI, sans-serif', fontSize: 11 },
      grid: { vertLines: { color: '#f0f1ec' }, horzLines: { color: '#f0f1ec' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, visible: false },
      handleScale: false,
      handleScroll: false
    })
    const series = chart.addSeries(AreaSeries, {
      lineColor: color, topColor: `${color}35`, bottomColor: `${color}02`, lineWidth: 3,
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
    const color = quote.changePct >= 0 ? '#ef5b5b' : '#1d9b69'
    seriesRef.current.applyOptions({ lineColor: color, topColor: `${color}35`, bottomColor: `${color}02` })
    chartRef.current?.timeScale().fitContent()
  }, [quote])

  return <div className="chart-region"><div className="market-chart" ref={containerRef} aria-label={`${quote?.name ?? ''}采样价格`} />
    {(!quote || quote.sparkline.length < 2) && <span className="chart-state">{!quote ? '等待行情' : quote.status === 'closed' ? '休市 · 最新收盘价' : '采样中'}</span>}
    <span className="chart-caption">采样价格</span>
  </div>
}
