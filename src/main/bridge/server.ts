import { createServer, type IncomingMessage, type Server } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { ZodError, z } from 'zod'
import { ShellRuntime, BridgeError } from './runtime'

const sessionId = z.object({ sessionId: z.string().uuid() }).strict()
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    const data = (chunk: Buffer): void => {
      size += chunk.length
      if (size > 16_384) {
        req.off('data', data); req.resume()
        reject(new BridgeError(413, 'Request too large'))
      } else chunks.push(chunk)
    }
    req.on('data', data)
    req.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.once('error', reject)
  })
}
/** Local authenticated transport only. External tools cannot access devices, keys or execute code. */
export class ShellServer {
  private server?: Server
  private token = ''
  private tick?: NodeJS.Timeout
  private previewTimer?: NodeJS.Timeout
  private transition: Promise<void> = Promise.resolve()
  constructor(readonly runtime: ShellRuntime, readonly connectionPath: string) {
    // A descriptor from a previous process never authorizes a new process.
    rmSync(connectionPath, { force: true })
  }
  enable(enabled: boolean): Promise<void> {
    const next = this.transition.then(async () => { if (enabled) await this.start(); else await this.stop() })
    this.transition = next.catch(() => {})
    return next
  }
  private async start(): Promise<void> {
    if (this.server) return
    this.token = randomBytes(32).toString('hex')
    let budget = 0, windowStart = Date.now()
    const server = createServer({ maxHeaderSize: 4096, requestTimeout: 5000, headersTimeout: 5000 }, async (req, res) => {
      const reply = (status: number, body: unknown): void => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)) }
      try {
        const address = server.address()
        if (!address || typeof address === 'string' || req.headers.origin !== undefined || req.headers.host !== `127.0.0.1:${address.port}`) throw new BridgeError(403, 'Forbidden origin or host')
        const supplied = Buffer.from(req.headers.authorization ?? '')
        const expected = Buffer.from(`Bearer ${this.token}`)
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new BridgeError(401, 'Unauthorized')
        if (Date.now() - windowStart > 1000) { budget = 0; windowStart = Date.now() }
        if (++budget > 60) throw new BridgeError(429, 'Too many requests')
        if (req.method === 'GET' && req.url === '/v1/state') { reply(200, { ...this.runtime.snapshot(), dances: this.runtime.dances(), capabilities: ['task', 'text', 'animation', 'cancellation', ...(this.runtime.dances() ? ['dance'] : [])] }); return }
        if (req.method !== 'POST' || !['/v1/sessions', '/v1/events', '/v1/heartbeat', '/v1/release'].includes(req.url ?? '')) throw new BridgeError(404, 'Unknown route')
        if (req.headers['content-type'] !== 'application/json') throw new BridgeError(415, 'Expected application/json')
        const body = await readBody(req)
        let input: unknown
        try { input = JSON.parse(body) } catch { throw new BridgeError(400, 'Invalid JSON') }
        if (req.url === '/v1/sessions') reply(200, this.runtime.claim(input))
        else if (req.url === '/v1/events') reply(200, this.runtime.event(input))
        else {
          const { sessionId: value } = sessionId.parse(input)
          if (req.url === '/v1/heartbeat') this.runtime.heartbeat(value)
          else this.runtime.release(value)
          reply(200, this.runtime.snapshot())
        }
      } catch (error) {
        reply(error instanceof BridgeError ? error.status : error instanceof ZodError ? 400 : 500,
          { error: error instanceof BridgeError ? error.message : error instanceof ZodError ? 'Invalid request fields' : 'Bridge request failed' })
      }
    })
    server.maxConnections = 16
    server.setTimeout(5000)
    server.keepAliveTimeout = 1000
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() }) })
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Missing loopback address')
      mkdirSync(dirname(this.connectionPath), { recursive: true })
      writeFileSync(this.connectionPath, JSON.stringify({ version: 1, url: `http://127.0.0.1:${address.port}`, token: this.token }), { mode: 0o600 })
      this.server = server
      this.runtime.enabled(true)
      this.tick = setInterval(() => this.runtime.snapshot(), 1000)
      this.tick.unref()
    } catch (error) { server.closeAllConnections(); server.close(); this.token = ''; rmSync(this.connectionPath, { force: true }); throw error }
  }
  preview(advance: boolean): void {
    if (this.previewTimer) clearTimeout(this.previewTimer)
    this.runtime.preview(advance)
    if (!advance) this.previewTimer = setTimeout(() => {
      if (this.runtime.snapshot().controller?.preview && this.runtime.snapshot().task?.status === 'working') this.runtime.preview()
    }, 2600)
  }
  release(): void { if (this.previewTimer) clearTimeout(this.previewTimer); this.runtime.release() }
  private async stop(): Promise<void> {
    this.release()
    this.token = ''
    rmSync(this.connectionPath, { force: true })
    if (this.tick) clearInterval(this.tick)
    const server = this.server; this.server = undefined
    this.runtime.enabled(false)
    if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())) }
  }
  /** Synchronous revocation for Electron's before-quit event. */
  dispose(): void {
    this.token = ''; rmSync(this.connectionPath, { force: true })
    if (this.tick) clearInterval(this.tick)
    if (this.previewTimer) clearTimeout(this.previewTimer)
    this.server?.closeAllConnections(); this.server?.close(); this.server = undefined
  }
}
