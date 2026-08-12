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
    const base = Math.floor(Date.now() / 1000) - quote.sparkline.length * 60
    seriesRef.current.setData(quote.sparkline.map((value, index) => ({ time: (base + index * 60) as UTCTimestamp, value })))
    chartRef.current?.timeScale().fitContent()
  }, [quote])

  return <div className="market-chart" ref={containerRef} aria-label={`${quote?.name ?? ''}分时走势`} />
}
