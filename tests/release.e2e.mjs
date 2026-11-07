// Real packaged app, isolated hidden profile, no model keys/cloud/device use.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { _electron as electron } from 'playwright'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { verifyReleaseArchive } from '../scripts/check-release-assets.mjs'

const root = resolve(import.meta.dirname, '..'), packed = join(root, 'dist/win-unpacked')
const userData = await mkdtemp(join(tmpdir(), 'debby-release-')), evidence = join(root, 'work/release')
await mkdir(evidence, { recursive: true })
await verifyReleaseArchive(packed)
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(DEBBY_QWEN_|OPENROUTER_|OPENAI_|ELECTRON_RUN_AS_NODE)/.test(key)))
Object.assign(env, { FINPET_E2E_USER_DATA: userData, FINPET_E2E_BACKGROUND: '1', FINPET_MARKET_SOURCE: 'demo', ELECTRON_RENDERER_URL: '' })
let app, page, client, stage = 'launch'
const errors = []
async function launch() {
  app = await electron.launch({ executablePath: join(packed, 'Debby.exe'), args: ['--mute-audio'], env })
  page = await app.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
}
const call = async (name, args = {}) => {
  const result = await client.callTool({ name: 'debby_' + name, arguments: args })
  assert.ok(!result.isError, JSON.stringify(result))
  return JSON.parse(result.content[0].text)
}
try {
  await launch()
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), true)
  stage = 'first-run whale'
  await page.waitForSelector('.layered-pet-host[data-layered-ready=true][data-view=full]', { timeout: 60000 })
  assert.equal(await page.locator('.three-pet-host').count(), 0)
  assert.ok(Number(await page.locator('.layered-pet-host').getAttribute('data-expression-textures')) <= 2)
  assert.equal((await page.evaluate(() => window.finpet.getChatState())).config.configured, false)
  assert.equal((await page.evaluate(() => window.finpet.getVoiceState())).config.configured, false)
  await page.screenshot({ path: join(evidence, 'first-run.png') })
  stage = 'native window drag'
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setPosition(100, 100))
  const box = await page.locator('.layered-pet-host').boundingBox()
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(point.x, point.y); await page.mouse.down()
  await page.mouse.move(point.x + 35, point.y + 20, { steps: 6 }); await page.mouse.up()
  await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0], deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      const [x, y] = w.getPosition()
      if (x === 135 && y === 120) return
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw Error('Native drag position did not follow the pointer')
  })
  stage = 'local preview without keys or network'
  await page.locator('[title="桌宠选项"]').click()
  await page.locator('[title="体验 Debby"]').click()
  await page.waitForSelector('[data-task-status=working]')
  assert.equal((await page.evaluate(() => window.finpet.getShellState())).enabled, false)
  await page.getByRole('button', { name: '继续演示', exact: true }).click()
  await page.waitForSelector('[data-task-status=completed]')
  await page.getByRole('button', { name: '结束演示', exact: true }).click()
  await page.waitForFunction(async () => !(await window.finpet.getShellState()).controller)
  stage = 'quick chat'
  await page.getByRole('button', { name: '快速对话', exact: true }).click()
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '对 Debby 说')
  assert.equal(await page.locator('dialog[open]').count(), 0)
  assert.equal((await page.evaluate(() => window.finpet.getVoiceState())).active, false)
  await page.evaluate(() => window.finpet.togglePanel())
  stage = 'packaged MCP copy and handshake'
  await app.evaluate(({ clipboard }) => { clipboard.writeText = text => { globalThis.releaseConfig = text } })
  await page.locator('[title="桌宠选项"]').click()
  await page.locator('#pet-options [title="Agent 接入"]').click()
  await page.getByRole('button', { name: '复制 MCP 配置', exact: true }).click()
  await page.getByRole('button', { name: '已复制 MCP 配置', exact: true }).waitFor()
  const config = JSON.parse(await app.evaluate(() => globalThis.releaseConfig)).mcpServers.debby
  assert.equal(config.command, join(packed, 'Debby.exe'))
  assert.equal(config.env.ELECTRON_RUN_AS_NODE, '1')
  assert.ok(config.args[0].startsWith(join(packed, 'resources/mcp')))
  assert.doesNotMatch(JSON.stringify(config), /Bearer|token|apiKey/)
  await page.getByRole('checkbox', { name: '允许本机 Agent 接入' }).click()
  await page.waitForFunction(async () => (await window.finpet.getShellState()).enabled)
  client = new Client({ name: 'Packaged MCP test', version: '1.0.0' })
  await client.connect(new StdioClientTransport({ command: config.command, args: config.args, env: { ...env, ...config.env }, stderr: 'pipe' }))
  assert.equal((await client.listTools()).tools.length, 7)
  await page.locator('[title="关闭 Agent 接入"]').click()
  stage = 'real MCP expression transitions'
  await call('set_task', { taskId: 'release-check', title: '正在检查你的项目', status: 'working', progress: .35 })
  await call('say', { taskId: 'release-check', turnId: 'work', text: '[[emotion:curious|0.8]]我会认真检查，你安心忙吧。' })
  await page.waitForSelector('.layered-pet-host[data-emotion=curious][data-emotion-source=agent]')
  await call('set_task', { taskId: 'release-check', title: '需要你的决定', status: 'waiting', progress: .65 })
  await page.waitForSelector('[data-task-status=waiting]')
  await call('set_task', { taskId: 'release-check', title: '完成啦！', status: 'completed', progress: 1 })
  await call('say', { taskId: 'release-check', turnId: 'done', text: '[[emotion:happy|0.9]]今天也一起向前了一小步。' })
  await call('animate', { taskId: 'release-check', name: 'celebrate' })
  await page.waitForSelector('.layered-pet-host[data-emotion=happy]')
  await page.screenshot({ path: join(evidence, 'mcp-completed.png') })
  stage = 'MCP dance with temporary 3D body'
  assert.equal((await call('list_dances')).library[0].id, 'welcome')
  await call('dance', { taskId: 'release-check', action: 'play', id: 'welcome', loop: true, expressionStyle: 'gentle' })
  await page.waitForSelector('[data-3d-ready=true][data-dance-id=welcome][data-view=full]', { timeout: 30000 })
  const pose = await page.locator('.three-pet-host').getAttribute('data-dance-pose')
  await page.waitForFunction(pose => document.querySelector('.three-pet-host').dataset.dancePose !== pose, pose)
  await call('dance', { taskId: 'release-check', action: 'stop' })
  await page.waitForSelector('.layered-pet-host[data-layered-ready=true][data-view=full]')
  await call('release'); await client.close(); client = undefined
  stage = '3D dance fallback'
  await page.evaluate(() => window.finpet.togglePanel())
  await page.locator('[title="桌宠选项"]').click()
  await page.locator('#pet-options [title="角色工坊"]').click()
  await page.getByRole('button', { name: '使用原来的 3D', exact: true }).click()
  await page.locator('[title="关闭角色工坊"]').click()
  await page.waitForSelector('[data-3d-ready=true]', { timeout: 30000 })
  await page.screenshot({ path: join(evidence, 'vrm-fallback.png') })
  stage = 'persisted user choice after restart'
  await app.close(); app = undefined
  await launch()
  await page.waitForSelector('[data-3d-ready=true]', { timeout: 60000 })
  assert.equal(await page.locator('.layered-pet-host').count(), 0, 'First-run defaults must not override a saved 3D choice')
  assert.deepEqual(errors, [])
  await writeFile(join(evidence, 'validation.json'), JSON.stringify({ passed: true, packaged: true, defaultCharacter: 'whale-girl', fullBody: true, localPreviewWithoutKey: true, quickChatWithoutModal: true, mcpRuntime: 'packaged Electron, no system Node', tools: 7, realMcpExpressions: true, realMcpDanceAndWhaleRestore: true, savedChoiceAfterRestart: true, pageErrors: errors }, null, 2))
  console.log('Packaged app passed: full-body whale, key-free local preview, quick chat, real bundled MCP, 3D fallback, restart persistence.')
} catch (error) {
  console.error(`Release verification failed at ${stage}: ${error.message}`)
  await page?.screenshot({ path: join(evidence, 'failure.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await client?.close().catch(() => {})
  await app?.close().catch(() => {})
  await rm(userData, { recursive: true, force: true })
}
