import assert from 'node:assert/strict'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const userData = await mkdtemp(join(tmpdir(), 'debby-mcp-e2e-'))
const connections = []
let app
async function connect(name, mode = 'legacy') {
  const client = new Client({ name, version: '1.0.0' }, { versionNegotiation: { mode } })
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve(root, 'scripts/debby-mcp.mjs'), '--connection', join(userData, 'agent-bridge.json'), '--name', name], cwd: root, stderr: 'pipe' })
  await client.connect(transport)
  connections.push(client)
  return client
}
const call = async (client, name, args = {}) => {
  const result = await client.callTool({ name: 'debby_' + name, arguments: args })
  assert.equal(result.isError, undefined, JSON.stringify(result))
  return JSON.parse(result.content[0].text)
}
try {
  app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env: { ...process.env, FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo' } })
  const page = await app.firstWindow()
  await app.evaluate(({ clipboard }) => { clipboard.writeText = text => { globalThis.__debbyCopiedConfig = text } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.waitForSelector('[data-3d-ready="true"]', { timeout: 30_000 })
  assert.equal((await page.evaluate(() => window.finpet.getShellState())).enabled, false)
  await page.locator('[title="桌宠选项"]').click()
  await page.locator('#pet-options [title="Agent 接入"]').click()
  await page.waitForSelector('.agent-dialog[open]')
  await page.getByRole('button', { name: '复制 MCP 配置' }).click()
  await page.getByRole('button', { name: '已复制 MCP 配置' }).waitFor()
  const config = JSON.parse(await app.evaluate(() => globalThis.__debbyCopiedConfig))
  assert.equal(config.mcpServers.debby.args[2], join(userData, 'agent-bridge.json'))
  assert.doesNotMatch(JSON.stringify(config), /Bearer|token/)
  await page.getByLabel('MCP 配置格式').selectOption('codex')
  await page.getByRole('button', { name: '复制 MCP 配置' }).click()
  await page.getByRole('button', { name: '已复制 MCP 配置' }).waitFor()
  const toml = await app.evaluate(() => globalThis.__debbyCopiedConfig)
  assert.match(toml, /^\[mcp_servers\.debby\]\ncommand = "node"\nargs = /)
  assert.deepEqual(JSON.parse(toml.split('args = ')[1]), [...config.mcpServers.debby.args.slice(0, -1), 'Codex'])
  const compactLayout = await page.locator('.agent-dialog').evaluate(e => ({ width: e.clientWidth, scroll: e.scrollWidth, rect: e.getBoundingClientRect().toJSON(), viewport: innerWidth }))
  assert.ok(compactLayout.scroll <= compactLayout.width && compactLayout.rect.x >= 0 && compactLayout.rect.right <= compactLayout.viewport, JSON.stringify(compactLayout))
  await page.screenshot({ path: resolve(root, 'work/agent-compact-dialog.png') })
  await page.getByRole('checkbox', { name: '允许本机 Agent 接入' }).check()
  await page.waitForFunction(async () => (await window.finpet.getShellState()).enabled)
  const agent = await connect('Harness E2E')
  assert.deepEqual((await agent.listTools()).tools.map(t => t.name).sort(), ['debby_animate', 'debby_dance', 'debby_get_state', 'debby_list_dances', 'debby_release', 'debby_say', 'debby_set_task'])
  assert.equal((await call(agent, 'get_state')).controller, undefined, 'Reading state must not acquire control')
  await call(agent, 'set_task', { taskId: 'build-1', title: '正在打磨你的项目', status: 'working', progress: .35 })
  assert.equal((await call(agent, 'list_dances')).library[0].id, 'welcome')
  await call(agent, 'dance', { taskId: 'build-1', action: 'play', id: 'welcome', loop: true, expressionStyle: 'gentle' })
  await page.waitForSelector('[data-dance-id=welcome][data-view=full]')
  await call(agent, 'say', { taskId: 'build-1', turnId: 'dance-face', text: '今天也一起向前吧。', expression: { emotion: 'shy', intensity: .8 } })
  await page.waitForSelector('[data-emotion=shy][data-emotion-source=agent][data-dance-id=welcome]')
  const poseWithFace = await page.locator('.three-pet-host').getAttribute('data-dance-pose')
  await page.waitForFunction(pose => document.querySelector('.three-pet-host').dataset.dancePose !== pose, poseWithFace)
  await call(agent, 'dance', { taskId: 'build-1', action: 'pause' })
  assert.equal((await call(agent, 'list_dances')).playback.status, 'paused')
  await call(agent, 'dance', { taskId: 'build-1', action: 'stop' })
  await page.waitForSelector('[data-view=portrait]')
  await call(agent, 'say', { taskId: 'build-1', turnId: 'reply-1', text: '我在认真检查', done: false })
  await call(agent, 'say', { taskId: 'build-1', turnId: 'reply-1', text: '，马上就好啦。', append: true, done: true })
  await page.waitForFunction(() => document.querySelector('.agent-full-caption')?.textContent === '我在认真检查，马上就好啦。')
  await page.locator('[title="关闭 Agent 接入"]').click()
  await page.waitForSelector('[data-task-status="working"]')
  await page.waitForSelector('[data-behavior="working"]', { timeout: 15_000 })
  const pixels = await page.evaluate(() => {
    const canvas = document.querySelector('.three-pet-canvas')
    return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.filter((_, i) => i % 4 === 3 && _ > 8).length
  })
  assert.ok(pixels > 1000, 'The controlled avatar must render actual pixels')
  await page.screenshot({ path: resolve(root, 'work/agent-compact.png') })
  const other = await connect('Other Agent', 'auto')
  const conflict = await other.callTool({ name: 'debby_set_task', arguments: { taskId: 'other', title: 'Do not steal', status: 'working' } })
  assert.equal(conflict.isError, true)
  await call(agent, 'set_task', { taskId: 'build-1', title: '需要你的决定', status: 'waiting', progress: .6 })
  await page.waitForSelector('[data-behavior="waiting"]', { timeout: 15_000 })
  await page.locator('[aria-label="查看 Agent 任务"]').click()
  await page.getByRole('button', { name: '取消任务', exact: true }).click()
  await page.waitForFunction(async () => (await window.finpet.getShellState()).task?.status === 'cancelled')
  assert.equal((await call(agent, 'get_state')).task.status, 'cancelled')
  const late = await agent.callTool({ name: 'debby_say', arguments: { taskId: 'build-1', turnId: 'late', text: '不能出现' } })
  assert.equal(late.isError, true)
  await call(agent, 'set_task', { taskId: 'build-2', title: '做好啦，来看看吧', status: 'working' })
  await call(agent, 'set_task', { taskId: 'build-2', title: '做好啦，来看看吧', status: 'completed', progress: 1 })
  await call(agent, 'say', { taskId: 'build-2', turnId: 'done', text: '检查完成！今天也一起向前了一小步。' })
  await call(agent, 'animate', { taskId: 'build-2', name: 'celebrate' })
  await page.locator('[title="关闭 Agent 接入"]').click()
  await page.waitForSelector('[data-behavior="celebrate"]', { timeout: 15_000 })
  await page.waitForFunction(() => document.querySelector('.three-pet-host').dataset.expression === 'sparkle' && Number(document.querySelector('.three-pet-host').dataset.emote) > 0.95)
  await page.screenshot({ path: resolve(root, 'work/debby-star-eyes.png') })
  await page.locator('[title="打开行情面板"]').click()
  await page.waitForSelector('.app-expanded')
  await page.screenshot({ path: resolve(root, 'work/agent-expanded.png') })
  await page.locator('[aria-label="查看 Agent 任务"]').click()
  await page.screenshot({ path: resolve(root, 'work/agent-connection.png') })
  // Narrow native window: dialog and task text must stay within viewport.
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setResizable(true); w.setSize(540, 700) })
  await page.waitForFunction(() => innerWidth === 540)
  const layout = await page.locator('.agent-dialog').evaluate(e => ({ width: e.clientWidth, scroll: e.scrollWidth, rect: e.getBoundingClientRect().toJSON(), viewport: innerWidth }))
  assert.ok(layout.scroll <= layout.width && layout.rect.x >= 0 && layout.rect.right <= layout.viewport, JSON.stringify(layout))
  await page.screenshot({ path: resolve(root, 'work/agent-narrow.png') })
  await call(agent, 'release')
  // The second client can acquire after release (tested over the modern opening too).
  await call(other, 'set_task', { taskId: 'next-agent', title: '第二个 Agent 已接入', status: 'working' })
  await other.close()
  await page.waitForFunction(async () => !(await window.finpet.getShellState()).controller, { timeout: 10_000 })
  await page.getByRole('button', { name: '体验一下' }).click()
  await page.getByRole('button', { name: '继续演示' }).waitFor({ timeout: 10_000 })
  assert.equal((await page.evaluate(() => window.finpet.getShellState())).controller.preview, true)
  await page.getByRole('button', { name: '继续演示' }).click()
  await page.waitForFunction(async () => (await window.finpet.getShellState()).task?.status === 'completed')
  // State is acknowledged asynchronously over IPC; wait for it before asserting the DOM.
  await page.getByRole('checkbox', { name: '允许本机 Agent 接入' }).click()
  await page.waitForFunction(async () => !(await window.finpet.getShellState()).enabled)
  await page.waitForFunction(() => !document.querySelector('input[aria-label="允许本机 Agent 接入"]').checked)
  await assert.rejects(access(join(userData, 'agent-bridge.json')))
  assert.deepEqual(errors, [])
  console.log('Agent shell E2E passed: official MCP client (legacy + auto), 7 tools, saved dance playback/pause/stop, ownership, streaming, cancellation, avatar pixels/poses, preview, compact/expanded/narrow UI, cleanup.')
} finally {
  await Promise.allSettled(connections.map(c => c.close()))
  await app?.close()
  await rm(userData, { recursive: true, force: true })
}
