import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocketServer, type WebSocket } from 'ws'
import { MarketHub } from '../src/main/market-hub'
import type { ProviderStatus, QuoteTick } from '../src/shared/types'

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
