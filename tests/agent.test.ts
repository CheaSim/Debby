import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { ChatKeyStore, type ChatCredentials } from '../src/main/agent/key-store'
import { OpenRouterGateway, chatError, freeToolModels } from '../src/main/agent/openrouter'
import { DebbyAgentRuntime, boundedContext } from '../src/main/agent/runtime'
import { marketToolsPlugin, registerTools } from '../src/main/agent/plugins'
import { marketClockPlugin } from '../examples/plugins/market-clock'

const syntheticKey = 'test-only-not-a-real-key-123456789'
const entry = (id = 'openrouter/free', prompt = '0') => ({ id, name: id, context_length: 200000, pricing: { prompt, completion: '0', request: '0' }, supported_parameters: ['tools'] })
const context = { getMarket: () => ({ provider: 'public' as const, providerName: '腾讯行情', providerStatus: 'live' as const, quotes: [{
  symbol: '000001.SH', name: '上证指数', price: 3842.19, previousClose: 3800, change: 42.19, changePct: 1.11,
  timestamp: Date.parse('2026-09-30T08:15:00Z'), status: 'closed' as const, sparkline: []
}] }), requestQuotes: fetch }
const credentials = (consent = true, configured = true): ChatCredentials => ({
  publicConfig: () => ({ configured, cloudConsent: consent, storage: configured ? 'encrypted' : 'none', modelId: 'openrouter/free' }),
  getKey: () => configured ? syntheticKey : undefined, configure: () => {}
})
const waitUntil = async (condition: () => boolean) => { for (let count = 0; count < 250; count++) { if (condition()) return; await new Promise((resolve) => setTimeout(resolve, 10)) } throw new Error('Condition timed out') }

describe('BYOK and free-model boundary', () => {
  it('only admits zero-price tools-capable models, including per-request fees', () => {
    expect(freeToolModels([entry(), entry('paid', '0.1'), { ...entry('no-tools'), supported_parameters: [] }, { ...entry('request-fee'), pricing: { prompt: '0', completion: '0', request: '0.2' } }, null])).toHaveLength(1)
    expect(freeToolModels([{ ...entry(), pricing: { prompt: null, completion: '' } }])).toHaveLength(0)
    expect(freeToolModels([{ ...entry(), reasoning: { mandatory: true } }])).toHaveLength(0)
  })
  it('encrypts credentials and never exposes them in public metadata', () => {
    const folder = mkdtempSync(join(tmpdir(), 'debby-key-test-'))
    const path = join(folder, 'credentials.json')
    const cipher = { available: () => true, encrypt: (text: string) => Buffer.from([...Buffer.from(text)].map((byte) => byte ^ 173)), decrypt: (value: Buffer) => Buffer.from([...value].map((byte) => byte ^ 173)).toString() }
    try {
      const store = new ChatKeyStore(path, cipher)
      store.configure({ apiKey: syntheticKey, modelId: 'openrouter/free', cloudConsent: true })
      expect(readFileSync(path, 'utf8')).not.toContain(syntheticKey)
      expect(JSON.stringify(store.publicConfig())).not.toContain(syntheticKey)
      expect(new ChatKeyStore(path, cipher).getKey()).toBe(syntheticKey)
      store.configure({ removeKey: true, modelId: 'openrouter/free', cloudConsent: false })
      expect(new ChatKeyStore(path, cipher).getKey()).toBeUndefined()
      const locked = new ChatKeyStore(path, { ...cipher, available: () => false })
      expect(() => locked.configure({ apiKey: syntheticKey, modelId: 'openrouter/free', cloudConsent: true })).toThrow(/加密/)
    } finally { rmSync(folder, { recursive: true, force: true }) }
  })
  it('rejects missing keys and consent before making any provider request', async () => {
    const transport = new OpenRouterGateway(async () => { throw new Error('must not request') })
    await expect(new DebbyAgentRuntime({ credentials: credentials(true, false), transport, tools: [] }).send('你好')).rejects.toThrow(/BYOK/)
    await expect(new DebbyAgentRuntime({ credentials: credentials(false), transport, tools: [] }).send('你好')).rejects.toThrow(/同意/)
    await expect(new DebbyAgentRuntime({ credentials: credentials(), transport, tools: [] }).send(syntheticKey)).rejects.toThrow(/不要/)
  })
  it('guards duplicate plugin and tool names', () => {
    expect(() => registerTools([marketToolsPlugin, marketToolsPlugin], context)).toThrow(/Duplicate plugin/)
    expect(() => registerTools([marketToolsPlugin, { ...marketToolsPlugin, id: 'another' }], context)).toThrow(/Duplicate tool/)
  })
  it('allows a standalone example plugin with a real executable tool', async () => {
    const tools = registerTools([marketClockPlugin], context)
    const response = await tools[0].execute('test', {}, new AbortController().signal)
    expect(response.content[0]).toMatchObject({ type: 'text' })
    expect(JSON.stringify(response.content)).toContain('Asia/Shanghai')
  })
  it('redacts provider errors instead of leaking upstream bodies', () => {
    expect(chatError(new Error(`401 ${syntheticKey}`))).not.toContain(syntheticKey)
    expect(chatError(new Error('429 limited'))).toMatch(/限制/)
    expect(chatError(new Error('402'))).toMatch(/收费/)
  })
  it('keeps complete user turns within the history budget', () => {
    const messages = Array.from({ length: 12 }, (_, index) => ({ role: 'user' as const, content: `${index}:${'x'.repeat(8000)}`, timestamp: index }))
    const bounded = boundedContext(messages)
    expect(bounded.length).toBeLessThan(8)
    expect(bounded.at(-1)).toEqual(messages.at(-1))
    expect(JSON.stringify(bounded).length).toBeLessThan(48000)
  })
  it('cancels a pending model catalog request before starting generation', async () => {
    const gateway = new OpenRouterGateway(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    const agent = new DebbyAgentRuntime({ credentials: credentials(), transport: gateway, tools: [] })
    await agent.send('你好')
    agent.cancel()
    await waitUntil(() => !agent.getState().busy)
    expect(agent.getState().error).toBeUndefined()
  })
  it('bounds the full request lifetime including catalog discovery', async () => {
    const gateway = new OpenRouterGateway(async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    }))
    const agent = new DebbyAgentRuntime({ credentials: credentials(), transport: gateway, tools: [], timeoutMs: 20 })
    await agent.send('你好')
    await waitUntil(() => !agent.getState().busy)
    expect(agent.getState().error).toMatch(/超时/)
  })
  it('serializes reset against a concurrently submitted prompt', async () => {
    const agent = new DebbyAgentRuntime({ credentials: credentials(), transport: new OpenRouterGateway(fetch), tools: [] })
    const clearing = agent.clear()
    await expect(agent.send('不能穿过重置')).rejects.toThrow(/重置/)
    await clearing
    expect(agent.getState().messages).toHaveLength(0)
  })
})

describe('real pi agent + OpenRouter-compatible SSE', () => {
  let server: Server
  let gateway: OpenRouterGateway
  let mode = 'tools'
  const requests: Array<Record<string, any>> = []
  const sockets = new Set<import('node:net').Socket>()
  beforeAll(async () => {
    server = createServer(async (request, response) => {
      if (request.url === '/models') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data: [entry('openrouter/free', mode === 'paid' ? '1' : '0')] })); return }
      if (request.url === '/key') { response.end(JSON.stringify({ data: { free_model_daily_requests: { remaining: 12, limit: 50 } } })); return }
      let body = ''
      for await (const chunk of request) body += chunk
      const payload = JSON.parse(body)
      requests.push(payload)
      expect(request.headers.authorization).toBe(`Bearer ${syntheticKey}`)
      if (mode === 'limited') { response.writeHead(429, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: 'limited', code: 429 } })); return }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      if (mode === 'slow') { response.write(': waiting\n\n'); return }
      const chunk = (delta: object, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: 'test-stream', model: payload.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      chunk({ role: 'assistant' })
      if (mode === 'endless' || !payload.messages.some((message: any) => message.role === 'tool')) {
        chunk({ tool_calls: [{ index: 0, id: 'quote-tool', type: 'function', function: { name: 'get_market_snapshot', arguments: '{}' } }] })
        chunk({}, 'tool_calls')
      } else {
        chunk({ content: '上证指数 3842.19，' })
        chunk({ content: '腾讯行情，9 月 30 日收盘。行情可能延迟，不构成投资建议。' })
        chunk({}, 'stop')
      }
      response.end('data: [DONE]\n\n')
    })
    server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address() as import('node:net').AddressInfo
    gateway = new OpenRouterGateway(fetch, `http://127.0.0.1:${address.port}`)
  })
  afterAll(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve) => server.close(() => resolve())) })
  const runtime = () => new DebbyAgentRuntime({ credentials: credentials(), transport: gateway, tools: registerTools([marketToolsPlugin], context), timeoutMs: 5000 })
  it('streams a reply, executes a real registered tool, preserves source time, and publishes safe state', async () => {
    mode = 'tools'; requests.length = 0
    const agent = runtime()
    const states: string[] = []
    const unsubscribe = agent.subscribe((state) => states.push(JSON.stringify(state)))
    agent.subscribe(() => { throw new Error('host observer failure must not stop the agent') })
    await agent.send('上证指数怎么样？')
    await expect(agent.send('再次询问')).rejects.toThrow(/还在回复/)
    await waitUntil(() => !agent.getState().busy)
    expect(agent.getState().error).toBeUndefined()
    expect(agent.getState().messages.at(-1)?.text).toContain('3842.19')
    expect(requests).toHaveLength(2)
    expect(requests[0].provider.max_price).toEqual({ prompt: 0, completion: 0 })
    expect(requests[0].reasoning).toEqual({ enabled: false, effort: 'none', exclude: true })
    const toolMessage = requests[1].messages.find((message: any) => message.role === 'tool')
    expect(toolMessage.content).toContain('2026-09-30T08:15:00.000Z')
    expect(states.join('')).toContain('查看指数与自选')
    expect(states.join('')).not.toContain(syntheticKey)
    expect(await agent.checkConnection()).toMatch(/12/)
    unsubscribe()
    await agent.clear()
    expect(agent.getState().messages).toHaveLength(0)
  })
  it('refuses a model that stopped being free without dispatching a completion', async () => {
    mode = 'paid'; requests.length = 0
    const agent = runtime()
    await agent.send('你好')
    await waitUntil(() => !agent.getState().busy)
    expect(requests).toHaveLength(0)
    expect(agent.getState().error).toMatch(/不再免费/)
  })
  it('surfaces rate limits with no automatic retry', async () => {
    mode = 'limited'; requests.length = 0
    const agent = runtime()
    await agent.send('你好')
    await waitUntil(() => !agent.getState().busy)
    expect(requests).toHaveLength(1)
    expect(agent.getState().error).toMatch(/限制/)
  })
  it('cancels an in-flight stream and can start a fresh conversation', async () => {
    mode = 'slow'; requests.length = 0
    const agent = runtime()
    await agent.send('你好')
    await waitUntil(() => requests.length === 1)
    agent.cancel()
    await waitUntil(() => !agent.getState().busy)
    expect(agent.getState().messages.at(-1)?.status).toBe('cancelled')
    await agent.clear()
    mode = 'tools'
    await agent.send('查看指数')
    await waitUntil(() => !agent.getState().busy)
    expect(agent.getState().messages.at(-1)?.text).toContain('3842.19')
  })
  it('limits endless tool loops and resets the turn allowance for the next prompt', async () => {
    mode = 'endless'; requests.length = 0
    const agent = new DebbyAgentRuntime({ credentials: credentials(), transport: gateway, tools: registerTools([marketToolsPlugin], context), maxTurns: 2 })
    await agent.send('一直查')
    await waitUntil(() => !agent.getState().busy)
    expect(requests).toHaveLength(2)
    expect(agent.getState().error).toMatch(/上限/)
    await agent.send('再次查询')
    await waitUntil(() => !agent.getState().busy)
    expect(requests).toHaveLength(4)
  })
})
