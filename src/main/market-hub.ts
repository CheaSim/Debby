import { EventEmitter } from 'node:events'
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import WebSocket from 'ws'
import { moodIndexSymbol, normalizeQuoteTick } from '../shared/domain'
import type { MarketProvider, ProviderStatus, QuoteTick } from '../shared/types'
import { fetchPublicQuotes, publicSourceNames, toPublicSymbol, type QuoteRequest } from './public-market'

type Instrument = { symbol: string; name: string; price: number; previousClose: number }
const instruments: Instrument[] = [
  { symbol: '000001.SH', name: '上证指数', price: 3576.4, previousClose: 3568.21 },
  { symbol: '399001.SZ', name: '深证成指', price: 11128.6, previousClose: 11084.35 },
  { symbol: '600519.SH', name: '贵州茅台', price: 1712.8, previousClose: 1701.3 },
  { symbol: 'AAPL', name: 'Apple', price: 230.21, previousClose: 228.91 }
]

export interface MarketHubOptions {
  source?: MarketProvider
  remoteUrl?: string
  symbols?: string[]
  cachePath?: string
  request?: QuoteRequest
}

export class MarketHub extends EventEmitter {
  private ticks = new Map<string, QuoteTick>()
  private timer?: NodeJS.Timeout
  private socket?: WebSocket
  private controller?: AbortController
  private sequence = 0
  private generation = 0
  private provider: MarketProvider = 'public'
  private providerName = '公开行情'
  private status: ProviderStatus = 'connecting'
  private stopped = true
  private options: MarketHubOptions

  constructor(options: MarketHubOptions | string = {}) {
    super()
    this.options = typeof options === 'string' ? { source: 'remote', remoteUrl: options } : options
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.generation += 1
    this.ticks.clear()
    this.provider = this.options.source ?? 'public'
    this.providerName = this.provider === 'demo' ? '演示行情' : this.provider === 'remote' ? '自定义中继' : '公开行情'
    if (this.provider === 'demo') this.startDemo()
    else if (this.provider === 'remote') this.connectRemote(this.generation)
    else {
      this.loadCache()
      this.setStatus('connecting', true)
      this.emit('quotes', this.getQuotes())
      void this.pollPublic(this.generation, 0)
    }
  }

  stop(): void {
    this.stopped = true
    this.generation += 1
    if (this.timer) { clearTimeout(this.timer); clearInterval(this.timer) }
    this.timer = undefined
    this.controller?.abort()
    this.controller = undefined
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.on('error', () => undefined)
      this.socket.close()
      this.socket = undefined
    }
  }

  restart(options: MarketHubOptions | string): void {
    this.stop()
    this.options = typeof options === 'string' ? { ...this.options, source: 'remote', remoteUrl: options } : options
    this.start()
  }

  getQuotes(): QuoteTick[] { return Array.from(this.ticks.values()) }
  getProvider(): MarketProvider { return this.provider }
  getProviderName(): string { return this.providerName }
  getStatus(): ProviderStatus { return this.status }
  private current(generation: number): boolean { return !this.stopped && generation === this.generation }
  private symbols(): string[] {
    return [...new Set([moodIndexSymbol, ...(this.options.symbols ?? ['399001.SZ', '399006.SZ', '600519.SH'])])]
      .filter((symbol) => Boolean(toPublicSymbol(symbol))).slice(0, 60)
  }

  private async pollPublic(generation: number, failures: number): Promise<void> {
    if (!this.current(generation)) return
    this.controller = new AbortController()
    let delay: number
    try {
      const result = await fetchPublicQuotes(this.symbols(), this.ticks, this.options.request, this.controller.signal)
      if (!this.current(generation)) return
      const sourceChanged = this.providerName !== publicSourceNames[result.source]
      this.providerName = publicSourceNames[result.source]
      for (const [symbol, quote] of this.ticks) this.ticks.set(symbol, { ...quote, status: 'offline' })
      for (const quote of result.quotes) this.ticks.set(quote.symbol, quote)
      this.setStatus('live', sourceChanged)
      this.emit('quotes', this.getQuotes())
      this.saveCache()
      failures = 0
      delay = result.quotes.some((quote) => quote.status === 'open') ? 10_000 : 60_000
    } catch {
      if (!this.current(generation)) return
      this.markOffline()
      this.emit('provider-error', '公开行情暂不可用，保留最近行情并稍后重试')
      failures += 1
      delay = Math.min(120_000, 15_000 * 2 ** failures)
    }
    if (this.current(generation)) this.timer = setTimeout(() => void this.pollPublic(generation, failures), delay + Math.random() * 1_000)
  }

  private loadCache(): void {
    if (!this.options.cachePath) return
    try {
      const cached = JSON.parse(readFileSync(this.options.cachePath, 'utf8')) as { quotes?: unknown; providerName?: string }
      if (!Array.isArray(cached.quotes)) return
      const allowed = new Set(this.symbols())
      for (const item of cached.quotes.slice(0, 60)) {
        const tick = normalizeQuoteTick(item)
        if (tick && allowed.has(tick.symbol)) this.ticks.set(tick.symbol, { ...tick, status: 'offline' })
      }
      if (Object.values(publicSourceNames).includes(cached.providerName ?? '')) this.providerName = cached.providerName!
    } catch { /* A missing or damaged cache must not prevent live requests. */ }
  }

  private saveCache(): void {
    if (!this.options.cachePath) return
    try {
      const temporaryPath = `${this.options.cachePath}.tmp`
      writeFileSync(temporaryPath, JSON.stringify({ providerName: this.providerName, quotes: this.getQuotes() }), 'utf8')
      renameSync(temporaryPath, this.options.cachePath)
    } catch { this.emit('provider-error', '行情缓存未能保存') }
  }

  private startDemo(): void {
    for (const item of instruments) this.ticks.set(item.symbol, this.toTick(item, item.price))
    this.setStatus('demo', true)
    this.emit('quotes', this.getQuotes())
    this.timer = setInterval(() => {
      this.sequence += 1
      for (const instrument of instruments) {
        const prior = this.ticks.get(instrument.symbol)?.price ?? instrument.price
        const wave = Math.sin(this.sequence / 4 + instrument.price) * 0.0007
        const noise = (Math.random() - 0.5) * 0.0012
        this.ticks.set(instrument.symbol, this.toTick(instrument, Math.max(0.01, prior * (1 + wave + noise))))
      }
      this.emit('quotes', this.getQuotes())
    }, 1_200)
  }

  private connectRemote(generation: number): void {
    if (!this.current(generation)) return
    const url = this.options.remoteUrl?.trim()
    if (!url) { this.markOffline(); return }
    this.setStatus('connecting', true)
    const socket = new WebSocket(url)
    this.socket = socket
    socket.on('message', (data) => {
      if (!this.current(generation)) return
      try {
        const payload: unknown = JSON.parse(data.toString())
        const records = Array.isArray(payload) ? payload : [payload]
        let accepted = 0
        for (const record of records) {
          const rawSymbol = record && typeof record === 'object' ? (record as Record<string, unknown>).symbol : undefined
          const previous = typeof rawSymbol === 'string' ? this.ticks.get(rawSymbol) : undefined
          const tick = normalizeQuoteTick(record, previous)
          if (tick) { this.ticks.set(tick.symbol, tick); accepted += 1 }
        }
        if (accepted === 0) throw new Error('no valid quotes')
        this.setStatus('live')
        this.emit('quotes', this.getQuotes())
      } catch { this.emit('provider-error', '行情数据格式无效') }
    })
    socket.on('close', () => {
      if (!this.current(generation)) return
      this.socket = undefined
      this.markOffline()
      this.timer = setTimeout(() => this.connectRemote(generation), 3_000)
    })
    socket.on('error', () => {
      if (!this.current(generation)) return
      this.markOffline()
      this.emit('provider-error', '行情服务连接失败，正在重试')
    })
  }

  private markOffline(): void {
    this.setStatus('offline')
    for (const [symbol, quote] of this.ticks) this.ticks.set(symbol, { ...quote, status: 'offline' })
    this.emit('quotes', this.getQuotes())
  }

  private setStatus(status: ProviderStatus, force = false): void {
    if (this.status === status && !force) return
    this.status = status
    this.emit('status', status)
  }

  private toTick(instrument: Instrument, price: number): QuoteTick {
    const previous = this.ticks.get(instrument.symbol)
    const rounded = Number(price.toFixed(price > 1000 ? 2 : 3))
    const change = rounded - instrument.previousClose
    return { symbol: instrument.symbol, name: instrument.name, price: rounded, previousClose: instrument.previousClose,
      change: Number(change.toFixed(2)), changePct: Number((change / instrument.previousClose * 100).toFixed(2)),
      timestamp: Date.now(), status: 'open', sparkline: [...(previous?.sparkline ?? [instrument.previousClose]), rounded].slice(-48) }
  }
}
