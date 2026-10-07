import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import { MarketHub } from '../src/main/market-hub'
import type { ProviderStatus, QuoteTick } from '../src/shared/types'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import { tencentRecord } from './fixtures/market'

let server: WebSocketServer | undefined
let hub: MarketHub | undefined

afterEach(async () => {
  hub?.stop()
  hub = undefined
  if (server) {
    for (const client of server.clients) client.terminate()
    await new Promise<void>((resolve) => server?.close(() => resolve()))
    server = undefined
  }
})

describe('MarketHub remote adapter', () => {
  it('normalizes quotes and publishes an offline state after disconnect', async () => {
    server = new WebSocketServer({ port: 0 })
    await once(server, 'listening')
    const { port } = server.address() as AddressInfo
    hub = new MarketHub(`ws://127.0.0.1:${port}`)

    const statuses: ProviderStatus[] = []
    hub.on('status', (status: ProviderStatus) => statuses.push(status))
    const connectionPromise = once(server, 'connection') as Promise<[WebSocket]>
    hub.start()
    const [client] = await connectionPromise

    const quotesPromise = new Promise<QuoteTick[]>((resolve) => {
      hub?.on('quotes', (quotes: QuoteTick[]) => {
        if (quotes.some((quote) => quote.symbol === 'TEST')) resolve(quotes)
      })
    })
    client.send(JSON.stringify({ symbol: 'TEST', name: '测试标的', price: 10.5, previousClose: 10 }))
    const quotes = await quotesPromise
    expect(quotes.find((quote) => quote.symbol === 'TEST')).toMatchObject({ change: 0.5, changePct: 5, status: 'open' })
    expect(statuses).toContain('live')

    const offlinePromise = new Promise<QuoteTick[]>((resolve) => {
      hub?.on('quotes', (next: QuoteTick[]) => {
        if (next.every((quote) => quote.status === 'offline')) resolve(next)
      })
    })
    client.close()
    const offlineQuotes = await offlinePromise
    expect(offlineQuotes.every((quote) => quote.status === 'offline')).toBe(true)
    expect(statuses).toContain('offline')
  })
})

describe('MarketHub public adapter', () => {
  it('starts without simulated quotes and persists only real snapshots', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'finpet-market-'))
    try {
      const cachePath = join(directory, 'market-cache.json')
      hub = new MarketHub({ cachePath, request: async () => new Response(tencentRecord()) })
      expect(hub.getQuotes()).toEqual([])
      const live = new Promise<QuoteTick[]>((resolve) => hub!.on('quotes', (quotes: QuoteTick[]) => {
        if (hub?.getStatus() === 'live') resolve(quotes)
      }))
      hub.start()
      const quotes = await live
      expect(hub.getProvider()).toBe('public')
      expect(hub.getProviderName()).toBe('腾讯行情')
      expect(quotes).toHaveLength(1)
      expect(JSON.parse(readFileSync(cachePath, 'utf8')).quotes[0].price).toBe(3842.19)
      hub.stop()
      hub = new MarketHub({ cachePath, request: async () => { throw new Error('offline') } })
      const offline = once(hub, 'status')
      hub.start()
      await offline
      await vi.waitFor(() => expect(hub?.getStatus()).toBe('offline'))
      expect(hub.getQuotes()[0]).toMatchObject({ price: 3842.19, status: 'offline' })
      expect(hub.getQuotes()[0].timestamp).toBe(quotes[0].timestamp)
    } finally { hub?.stop(); rmSync(directory, { recursive: true, force: true }) }
  })

  it('does not let a completed old request overwrite a new source or leave a retry running', async () => {
    vi.useFakeTimers()
    try {
      let resolveRequest!: (response: Response) => void
      const request = vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve }))
      hub = new MarketHub({ request })
      hub.start()
      hub.restart({ source: 'demo', request })
      resolveRequest(new Response(tencentRecord()))
      await vi.advanceTimersByTimeAsync(35_000)
      expect(hub.getProvider()).toBe('demo')
      expect(hub.getStatus()).toBe('demo')
      expect(hub.getQuotes()).toHaveLength(4)
      expect(request).toHaveBeenCalledTimes(1)
      hub.stop()
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
})
