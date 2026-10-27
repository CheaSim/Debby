import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { ShellRuntime } from '../src/main/bridge/runtime'
import { ShellServer } from '../src/main/bridge/server'

function fixture() {
  let now = 100
  const runtime = new ShellRuntime(() => {}, () => now)
  runtime.enabled(true)
  const { sessionId } = runtime.claim({ name: 'Test Agent' })
  let seq = 0
  const event = (fields: Record<string, unknown>) => runtime.event({ sessionId, seq: ++seq, taskId: 'task-1', ...fields })
  const task = (fields = {}) => event({ type: 'task', title: '整理项目', status: 'working', ...fields })
  return { runtime, sessionId, task, event, advance: () => { now += 120_001 } }
}
describe('avatar controller lifecycle', () => {
  it('requires explicit enable and prevents a second controller from stealing control', () => {
    const disabled = new ShellRuntime(() => {})
    expect(() => disabled.claim({ name: 'Agent' })).toThrow(/开启/)
    const { runtime } = fixture()
    expect(() => runtime.claim({ name: 'Other Agent' })).toThrow(/其他 Agent/)
    expect(runtime.snapshot().controller?.name).toBe('Test Agent')
  })
  it('expires the lease and revokes old session IDs', () => {
    const f = fixture(); f.task(); f.advance()
    expect(f.runtime.snapshot().controller).toBeUndefined()
    expect(() => f.task()).toThrow(/会话已结束/)
    expect(f.runtime.claim({ name: 'Replacement' }).sessionId).not.toBe(f.sessionId)
  })
  it('rejects replayed messages without changing the displayed state', () => {
    const f = fixture(); f.task()
    const state = f.runtime.snapshot()
    expect(() => f.runtime.event({ sessionId: f.sessionId, seq: 1, taskId: 'task-1', type: 'animate', name: 'comfort' })).toThrow(/序号/)
    expect(f.runtime.snapshot()).toEqual(state)
  })
  it('cancels locally and rejects all late task, caption and animation updates', () => {
    const f = fixture(); f.task(); f.runtime.cancel()
    expect(() => f.task()).toThrow(/取消/)
    expect(() => f.event({ type: 'say', turnId: 'turn-1', text: 'late' })).toThrow(/取消/)
    expect(() => f.event({ type: 'animate', name: 'celebrate' })).toThrow(/取消/)
    expect(f.runtime.snapshot().task?.status).toBe('cancelled')
    f.task({ taskId: 'task-2' })
    expect(() => f.task()).toThrow(/过期/)
  })
  it('assembles streamed captions and freezes completed or superseded turns', () => {
    const f = fixture(); f.task()
    f.event({ type: 'say', turnId: 'a', text: '你好', done: false })
    f.event({ type: 'say', turnId: 'a', text: '呀', append: true, done: true })
    expect(f.runtime.snapshot().caption?.text).toBe('你好呀')
    expect(() => f.event({ type: 'say', turnId: 'a', text: 'late' })).toThrow(/已结束/)
    f.event({ type: 'say', turnId: 'b', text: 'new', done: false })
    expect(() => f.event({ type: 'say', turnId: 'a', text: 'late' })).toThrow(/过期/)
  })
  it('keeps optional typed expressions across text chunks, expires them and clears them on cancellation', () => {
    const f = fixture(); f.task()
    f.event({ type: 'say', turnId: 'a', text: '辛苦啦', done: false, expression: { emotion: 'caring', intensity: .6 } })
    const caption = f.runtime.snapshot().caption!
    expect(caption.expression).toEqual({ emotion: 'caring', intensity: .6 })
    expect(caption.expressionExpiresAt).toBe(6600)
    f.event({ type: 'say', turnId: 'a', text: '我陪你。', append: true })
    expect(f.runtime.snapshot().caption?.expressionExpiresAt).toBe(caption.expressionExpiresAt)
    const before = f.runtime.snapshot()
    expect(() => f.event({ type: 'say', turnId: 'bad', text: 'x', expression: { emotion: 'execute' } })).toThrow()
    expect(() => f.event({ type: 'say', turnId: 'bad', text: 'x', expression: { emotion: 'happy', intensity: Infinity } })).toThrow()
    expect(f.runtime.snapshot()).toEqual(before)
    f.runtime.cancel()
    expect(f.runtime.snapshot().caption).toBeUndefined()
  })
  it('bounds assembled captions and validates event fields atomically', () => {
    const f = fixture(); f.task()
    f.event({ type: 'say', turnId: 'a', text: 'a'.repeat(1999), done: false })
    const before = f.runtime.snapshot()
    expect(() => f.event({ type: 'say', turnId: 'a', text: 'too long', append: true })).toThrow(/2000/)
    expect(() => f.task({ progress: Infinity })).toThrow()
    expect(() => f.event({ type: 'animate', name: 'execute-command' })).toThrow()
    expect(f.runtime.snapshot()).toEqual(before)
  })
  it('requires new IDs after completion and clears all session content on release', () => {
    const f = fixture(); f.task({ status: 'completed', progress: 1 })
    expect(() => f.task()).toThrow(/任务已结束/)
    f.runtime.release(f.sessionId)
    expect(f.runtime.snapshot()).toMatchObject({ enabled: true })
    expect(f.runtime.snapshot().task).toBeUndefined()
    expect(() => f.runtime.heartbeat(f.sessionId)).toThrow(/会话已结束/)
  })
  it('keeps preview explicitly separate and waits for local user continuation', () => {
    const runtime = new ShellRuntime(() => {})
    runtime.preview(); runtime.preview()
    expect(runtime.snapshot()).toMatchObject({ enabled: false, controller: { preview: true }, task: { status: 'waiting' } })
    runtime.preview(true)
    expect(runtime.snapshot().task?.status).toBe('completed')
    expect(() => fixture().runtime.preview()).toThrow(/断开/)
  })
})

describe('authenticated loopback bridge', () => {
  it('enforces authentication, Origin, schema, size bounds, revocation and descriptor cleanup', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'debby-bridge-'))
    const path = join(dir, 'agent-bridge.json')
    const runtime = new ShellRuntime(() => {})
    const server = new ShellServer(runtime, path)
    try {
      expect(existsSync(path)).toBe(false)
      await server.enable(true)
      const config = JSON.parse(readFileSync(path, 'utf8'))
      expect(new URL(config.url).hostname).toBe('127.0.0.1')
      const request = (path: string, body?: unknown, extra = {}) => fetch(config.url + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json', ...extra },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
      expect((await request('/v1/state', undefined, { Authorization: 'Bearer invalid' })).status).toBe(401)
      expect((await request('/v1/state', undefined, { Origin: 'https://example.com' })).status).toBe(403)
      const hostileHostStatus = await new Promise<number | undefined>((resolve, reject) => {
        const req = httpRequest(config.url + '/v1/state', { headers: { Host: 'example.com', Authorization: `Bearer ${config.token}` } }, res => { res.resume(); resolve(res.statusCode) })
        req.on('error', reject); req.end()
      })
      expect(hostileHostStatus).toBe(403)
      expect(JSON.stringify(await (await request('/v1/state')).json())).not.toContain(config.token)
      expect((await request('/v1/events', { command: 'execute' })).status).toBe(400)
      expect((await request('/v1/sessions', { name: 'x'.repeat(20_000) })).status).toBe(413)
      const session = await (await request('/v1/sessions', { name: 'MCP' })).json()
      expect((await request('/v1/sessions', { name: 'Other' })).status).toBe(409)
      expect((await request('/v1/events', { sessionId: session.sessionId, seq: 1, taskId: 't1', type: 'task', title: 'Hello', status: 'working' })).status).toBe(200)
      await server.enable(false)
      expect(existsSync(path)).toBe(false)
      expect(runtime.snapshot().enabled).toBe(false)
      await server.enable(true)
      const renewed = JSON.parse(readFileSync(path, 'utf8'))
      expect(renewed.token).not.toBe(config.token)
      expect((await fetch(renewed.url + '/v1/state', { headers: { Authorization: `Bearer ${config.token}` } })).status).toBe(401)
    } finally { server.dispose(); rmSync(dir, { recursive: true, force: true }) }
  })
})
