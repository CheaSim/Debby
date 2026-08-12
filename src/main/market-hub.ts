import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import { normalizeQuoteTick } from '../shared/domain'
import type { ProviderStatus, QuoteTick } from '../shared/types'

type Instrument = { symbol: string; name: string; price: number; previousClose: number }

const instruments: Instrument[] = [
  { symbol: '000001.SH', name: '上证指数', price: 3576.4, previousClose: 3568.21 },
  { symbol: '399001.SZ', name: '深证成指', price: 11128.6, previousClose: 11084.35 },
  { symbol: '600519.SH', name: '贵州茅台', price: 1712.8, previousClose: 1701.3 },
  { symbol: 'AAPL', name: 'Apple', price: 230.21, previousClose: 228.91 }
]

export class MarketHub extends EventEmitter {
  private ticks = new Map<string, QuoteTick>()
  private interval?: NodeJS.Timeout
  private socket?: WebSocket
  private sequence = 0
  private provider: 'demo' | 'remote' = 'demo'
  private status: ProviderStatus = 'demo'
  private stopped = false

  constructor(private remoteUrl?: string) {
    super()
    for (const item of instruments) this.ticks.set(item.symbol, this.toTick(item, item.price))
  }

  start(): void {
    this.stopped = false
    if (this.remoteUrl) this.connectRemote()
    else this.startDemo()
  }

  stop(): void {
    this.stopped = true
    if (this.interval) clearInterval(this.interval)
    this.interval = undefined
    this.socket?.removeAllListeners()
    this.socket?.close()
    this.socket = undefined
  }

  restart(remoteUrl?: string): void {
    this.stop()
    this.remoteUrl = remoteUrl?.trim() || undefined
    this.start()
  }

  getQuotes(): QuoteTick[] {
    return Array.from(this.ticks.values())
  }

  getProvider(): 'demo' | 'remote' {
    return this.provider
  }

  getStatus(): ProviderStatus {
    return this.status
  }

  private startDemo(): void {
    if (this.interval) return
    this.provider = 'demo'
    this.setStatus('demo')
    for (const [symbol, quote] of this.ticks) this.ticks.set(symbol, { ...quote, status: 'open', timestamp: Date.now() })
    this.emit('quotes', this.getQuotes())
    this.interval = setInterval(() => {
      this.sequence += 1
      for (const instrument of instruments) {
        const prior = this.ticks.get(instrument.symbol)?.price ?? instrument.price
        const wave = Math.sin(this.sequence / 4 + instrument.price) * 0.0007
        const noise = (Math.random() - 0.5) * 0.0012
        const next = Math.max(0.01, prior * (1 + wave + noise))
        this.ticks.set(instrument.symbol, this.toTick(instrument, next))
      }
      this.emit('quotes', this.getQuotes())
    }, 1_200)
  }

  private connectRemote(): void {
    if (!this.remoteUrl || this.stopped) return
    this.provider = 'remote'
    this.setStatus('connecting')
    this.socket = new WebSocket(this.remoteUrl)
    this.socket.on('open', () => this.setStatus('live'))
    this.socket.on('message', (data) => {
      try {
        const payload: unknown = JSON.parse(data.toString())
        const records = Array.isArray(payload) ? payload : [payload]
        let accepted = 0
        for (const record of records) {
          const rawSymbol = record && typeof record === 'object' ? (record as Record<string, unknown>).symbol : undefined
          const previous = typeof rawSymbol === 'string' ? this.ticks.get(rawSymbol) : undefined
          const tick = normalizeQuoteTick(record, previous)
          if (tick) {
            this.ticks.set(tick.symbol, tick)
            accepted += 1
          }
        }
        if (accepted === 0) throw new Error('no valid quotes')
        this.setStatus('live')
        this.emit('quotes', this.getQuotes())
      } catch {
        this.emit('provider-error', '行情数据格式无效')
      }
    })
    this.socket.on('close', () => {
      this.socket = undefined
      this.markOffline()
      if (!this.stopped) setTimeout(() => this.connectRemote(), 3_000)
    })
    this.socket.on('error', () => {
      this.markOffline()
      this.emit('provider-error', '行情服务连接失败，正在重试')
    })
  }

  private markOffline(): void {
    this.setStatus('offline')
    for (const [symbol, quote] of this.ticks) this.ticks.set(symbol, { ...quote, status: 'offline' })
    this.emit('quotes', this.getQuotes())
  }

  private setStatus(status: ProviderStatus): void {
    if (this.status === status) return
    this.status = status
    this.emit('status', status)
  }

  private toTick(instrument: Instrument, price: number): QuoteTick {
    const previous = this.ticks.get(instrument.symbol)
    const rounded = Number(price.toFixed(price > 1000 ? 2 : 3))
    const change = rounded - instrument.previousClose
    return {
      symbol: instrument.symbol,
      name: instrument.name,
      price: rounded,
      previousClose: instrument.previousClose,
      change: Number(change.toFixed(2)),
      changePct: Number(((change / instrument.previousClose) * 100).toFixed(2)),
      timestamp: Date.now(),
      status: 'open',
      sparkline: [...(previous?.sparkline ?? [instrument.previousClose]), rounded].slice(-48)
    }
  }
}
