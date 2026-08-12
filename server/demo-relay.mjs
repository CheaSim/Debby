import { createServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'

const host = process.env.FINPET_RELAY_HOST ?? '127.0.0.1'
const port = Number(process.env.FINPET_RELAY_PORT ?? 8787)
const instruments = [
  { symbol: '000001.SH', name: '上证指数', price: 3576.4, previousClose: 3568.21 },
  { symbol: '399001.SZ', name: '深证成指', price: 11128.6, previousClose: 11084.35 },
  { symbol: '600519.SH', name: '贵州茅台', price: 1712.8, previousClose: 1701.3 },
  { symbol: 'AAPL', name: 'Apple', price: 230.21, previousClose: 228.91 }
]
const history = new Map(instruments.map((instrument) => [instrument.symbol, [instrument.previousClose]]))
let sequence = 0

const httpServer = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ ok: true, clients: relay.clients.size, mode: 'demo' }))
    return
  }
  response.writeHead(404).end()
})
const relay = new WebSocketServer({ server: httpServer })

const timer = setInterval(() => {
  sequence += 1
  const ticks = instruments.map((instrument, index) => {
    const points = history.get(instrument.symbol) ?? [instrument.previousClose]
    const prior = points.at(-1) ?? instrument.price
    const price = Number((prior * (1 + Math.sin(sequence / 5 + index) * 0.0007)).toFixed(prior > 1000 ? 2 : 3))
    points.push(price)
    history.set(instrument.symbol, points.slice(-60))
    const change = price - instrument.previousClose
    return {
      ...instrument,
      price,
      change: Number(change.toFixed(3)),
      changePct: Number((change / instrument.previousClose * 100).toFixed(3)),
      timestamp: Date.now(),
      status: 'open',
      sparkline: history.get(instrument.symbol)
    }
  })
  const payload = JSON.stringify(ticks)
  for (const client of relay.clients) if (client.readyState === WebSocket.OPEN) client.send(payload)
}, 1_000)

httpServer.listen(port, host, () => {
  console.log(`FinPet demo relay: ws://${host}:${port}`)
  console.log(`Health check: http://${host}:${port}/health`)
})

function shutdown() {
  clearInterval(timer)
  for (const client of relay.clients) client.close(1001, 'server shutdown')
  relay.close(() => httpServer.close())
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
