import { readFile } from 'node:fs/promises'

/** Small transport adapter for custom harnesses. No Electron or model-provider dependency. */
export class DebbyClient {
  constructor(connectionPath, name = 'MCP Agent') {
    this.connectionPath = connectionPath
    this.name = name
    this.seq = 0
    this.queue = Promise.resolve()
  }
  async request(path, body) {
    let connection
    try { connection = JSON.parse(await readFile(this.connectionPath, 'utf8')) }
    catch { throw new Error('请启动 Debby，并在「Agent 接入」中开启本机接入。') }
    const url = new URL(connection.url)
    if (connection.version !== 1 || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !/^[a-f0-9]{64}$/.test(connection.token)) throw new Error('无效的 Debby 连接文件。')
    let response
    try {
      response = await fetch(new URL(path, url), {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${connection.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    } catch { throw new Error('Debby 未连接，请检查桌宠是否运行并已开启 Agent 接入。') }
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || `Debby 请求失败 (${response.status})`)
    return result
  }
  getState() { return this.request('/v1/state') }
  serial(fn) {
    const next = this.queue.then(fn)
    this.queue = next.catch(() => {})
    return next
  }
  async connect() {
    if (this.sessionId) return
    const result = await this.request('/v1/sessions', { name: this.name })
    this.sessionId = result.sessionId
    this.timer = setInterval(() => {
      void this.request('/v1/heartbeat', { sessionId: this.sessionId }).catch(() => { clearInterval(this.timer) })
    }, 30_000)
    this.timer.unref()
  }
  event(event) {
    return this.serial(async () => {
      await this.connect()
      return this.request('/v1/events', { ...event, sessionId: this.sessionId, seq: ++this.seq })
    })
  }
  setTask(taskId, title, status, progress) { return this.event({ type: 'task', taskId, title, status, progress }) }
  say(taskId, turnId, text, { append = false, done = true } = {}) { return this.event({ type: 'say', taskId, turnId, text, append, done }) }
  animate(taskId, name) { return this.event({ type: 'animate', taskId, name }) }
  async listDances() { return (await this.getState()).dances }
  dance(taskId, command) { return this.event({ ...command, type: 'dance', taskId }) }
  release() {
    return this.serial(async () => {
      clearInterval(this.timer)
      const sessionId = this.sessionId
      this.sessionId = undefined
      if (sessionId) await this.request('/v1/release', { sessionId })
    })
  }
}
