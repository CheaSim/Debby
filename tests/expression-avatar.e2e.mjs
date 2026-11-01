import assert from 'node:assert/strict'
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { _electron as electron } from 'playwright'
import sharp from 'sharp'
import { DebbyClient } from '../integrations/client.mjs'

const root = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url)
const input = resolve(root, process.env.DEBBY_EXPRESSION_BUNDLE || 'src/renderer/public/models/whale-girl/debby-whale-girl.debby')
const bundle = JSON.parse(await readFile(input, 'utf8'))
const evidence = resolve(root, 'work/expression-avatar'), userData = await mkdtemp(resolve(tmpdir(), 'debby-expressions-'))
await mkdir(evidence, { recursive: true })
let app, harness
try {
  app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env: { ...process.env, FINPET_E2E_USER_DATA: userData, FINPET_E2E_BACKGROUND: '1', FINPET_MARKET_SOURCE: 'demo' } })
  const page = await app.firstWindow(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForSelector('[data-3d-ready=true]', { timeout: 30000 })
  await page.evaluate(() => {
    globalThis.expressionGlStats = new Map()
    const proto = WebGLRenderingContext.prototype
    for (const [method, key, delta] of [['createProgram', 'programs', 1], ['createFramebuffer', 'masks', 1], ['createTexture', 'textures', 1], ['deleteTexture', 'textures', -1]]) {
      const original = proto[method]
      proto[method] = function (...args) {
        const result = original.apply(this, args)
        if (delta > 0 ? result : args[0]) {
          const stats = globalThis.expressionGlStats.get(this.canvas) || { programs: 0, masks: 0, textures: 0 }
          stats[key] += delta; globalThis.expressionGlStats.set(this.canvas, stats)
        }
        return result
      }
    }
  })
  const open = async () => { await page.getByTitle('桌宠选项', { exact: true }).click(); await page.getByTitle('角色工坊', { exact: true }).click() }
  await open()
  // Exercise the real parser and SHA verification using a deliberately tampered variant.
  const corrupt = structuredClone(bundle); corrupt.poses[0].sha256 = '0'.repeat(64)
  await page.getByLabel('导入角色 PSD', { exact: true }).setInputFiles({ name: 'invalid.debby', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(corrupt)) })
  await page.getByRole('alert').filter({ hasText: '校验失败' }).waitFor()
  if (process.env.DEBBY_EXPRESSION_BUNDLE) await page.getByLabel('导入角色 PSD', { exact: true }).setInputFiles(input)
  else await page.getByRole('button', { name: '遇见鲸鱼娘', exact: false }).click()
  await page.waitForSelector('.avatar-preview [data-layered-ready=true]', { timeout: 60000 })
  const host = page.locator('.avatar-preview .layered-pet-host')
  const startClock = Number(await host.getAttribute('data-elapsed')), fingerprints = new Set(), images = []
  await page.waitForSelector('.avatar-preview [data-rendered-view=full]')
  for (const [index, pose] of bundle.poses.entries()) {
    await page.getByLabel('预览立绘', { exact: true }).selectOption(pose.id)
    await page.waitForFunction(id => {
      const host = document.querySelector('.avatar-preview .layered-pet-host')
      return host.dataset.expressionPose === id && host.dataset.expressionTransitioning === 'false'
    }, pose.id)
    const image = Buffer.from((await page.locator('.avatar-preview canvas').evaluate(canvas => canvas.toDataURL())).split(',')[1], 'base64')
    fingerprints.add(createHash('sha256').update(image).digest('hex'))
    await sharp(image).toFile(resolve(evidence, pose.id + '.png'))
    images.push({ input: await sharp(image).resize(280, 400, { fit: 'contain', background: '#f4f0fa' }).flatten({ background: '#f4f0fa' }).png().toBuffer(), left: index % 4 * 280, top: Math.floor(index / 4) * 400 })
    assert.ok(Number(await host.getAttribute('data-expression-textures')) <= 2, 'Bounded texture cache on one WebGL context')
    assert.ok(Number(await host.getAttribute('data-elapsed')) >= startClock, 'Switching illustrations preserves the animation clock')
  }
  assert.equal(fingerprints.size, bundle.poses.length, 'Every authored pose produces a different real image')
  await sharp({ create: { width: 1120, height: Math.ceil(images.length / 4) * 400, channels: 4, background: '#f4f0fa' } }).composite(images).png().toFile(resolve(evidence, 'poses.png'))
  await page.getByLabel('预览立绘', { exact: true }).selectOption('')
  for (const [emotion, id] of Object.entries(bundle.expressions)) {
    await page.getByLabel('预览表情', { exact: true }).selectOption(emotion)
    await page.waitForFunction(id => document.querySelector('.avatar-preview .layered-pet-host').dataset.expressionPose === id, id)
  }
  const allocations = await page.evaluate(() => [...globalThis.expressionGlStats].filter(([canvas]) => canvas.dataset.expressionPose).map(([, stats]) => stats))
  assert.ok(allocations.length)
  for (const stats of allocations) {
    assert.equal(stats.programs, 1, 'Pose eviction reuses one shader program per WebGL context')
    assert.ok(stats.masks <= 1, 'Eye coverage framebuffer is shared across illustrations')
    assert.ok(stats.textures <= 2 * 64 + 1, 'Evicted illustration textures are actually deleted')
  }
  await page.getByText('动作与幅度', { exact: true }).click()
  await page.getByLabel('动作幅度', { exact: true }).evaluate(input => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2.3')
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForFunction(() => document.querySelector('.avatar-motion-range output').textContent === '2.3×')
  await page.getByLabel('预览动作', { exact: true }).selectOption('greet')
  await page.getByRole('button', { name: '播放动作', exact: true }).click()
  await page.waitForSelector('.avatar-preview [data-behavior=greet]')
  await page.getByRole('button', { name: '试试口型', exact: true }).click()
  await page.waitForFunction(() => Number(document.querySelector('.avatar-preview .layered-pet-host').dataset.mouth) > .3)
  await page.getByLabel('预览表情', { exact: true }).selectOption('shy')
  await page.waitForFunction(id => { const host = document.querySelector('.avatar-preview .layered-pet-host'); return host.dataset.expressionPose === id && Number(host.dataset.mouth) > .3 }, bundle.expressions.shy)
  await page.getByRole('button', { name: '停止试口型', exact: true }).click()
  await page.screenshot({ path: resolve(evidence, 'studio.png') })
  await page.getByRole('button', { name: '用这个角色陪我', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '已换上新角色' }).waitFor()
  await page.getByTitle('关闭角色工坊').click()
  await page.reload()
  await page.waitForSelector('.pet-wrap [data-layered-ready=true]', { timeout: 60000 }).catch(async error => {
    console.error('Avatar restore diagnostics:', JSON.stringify({ errors, text: await page.locator('body').innerText(), hosts: await page.locator('.layered-pet-host').evaluateAll(hosts => hosts.map(host => ({ ...host.dataset }))) }))
    await page.screenshot({ path: resolve(evidence, 'restore-failure.png') }); throw error
  })
  await page.waitForSelector('.pet-wrap [data-view=full][data-rendered-view=full]')
  await page.getByRole('button', { name: '快速对话', exact: true }).click()
  await page.waitForSelector('.app-dialogue .pet-wrap [data-view=full][data-rendered-view=full]')
  await page.screenshot({ path: resolve(evidence, 'dialogue-fullbody.png') })
  await page.getByRole('tab', { name: '行情', exact: true }).click()
  await open(); await page.getByText('动作与幅度', { exact: true }).click()
  assert.equal(await page.getByLabel('动作幅度', { exact: true }).inputValue(), '2.3', 'Motion preference persists with the full expression bundle')
  await page.getByTitle('关闭角色工坊').click()
  await page.evaluate(() => window.finpet.enableShell(true))
  harness = new DebbyClient(resolve(userData, 'agent-bridge.json'), 'Whale expression QA')
  await harness.setTask('whale-expression', '检查鲸鱼娘多立绘', 'working')
  for (const [emotion, id] of Object.entries(bundle.expressions)) {
    await harness.say('whale-expression', 'pose-' + emotion, 'Debby 会陪在你身边。', { expression: { emotion, intensity: .8 } })
    await page.waitForFunction(id => document.querySelector('.pet-wrap .layered-pet-host').dataset.expressionPose === id, id)
  }
  await page.evaluate(() => window.finpet.cancelShellTask()); await harness.release(); harness = undefined
  await page.evaluate(() => window.finpet.controlDance({ action: 'play', id: 'welcome' }))
  await page.waitForSelector('.pet-wrap [data-3d-ready=true]', { timeout: 30000 })
  await page.evaluate(() => window.finpet.controlDance({ action: 'stop' }))
  await page.waitForSelector('.pet-wrap [data-layered-ready=true]', { timeout: 60000 })
  await page.waitForSelector('.pet-wrap [data-view=full][data-rendered-view=full]')
  assert.equal((await page.evaluate(() => window.finpet.getVoiceState())).active, false)
  assert.deepEqual(await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { visible: w.isVisible(), focused: w.isFocused(), muted: w.webContents.isAudioMuted() } }), { visible: false, focused: false, muted: true })
  assert.deepEqual(errors, [])
  console.log(`Expression avatar E2E passed: ${bundle.poses.length} real layered illustrations, dialogue/MCP mappings, bounded textures, continuous lip/clock, persistent motion setting, dance restore; no focus/audio/devices.`)
} finally { await harness?.release().catch(() => {}); await app?.close(); await rm(userData, { recursive: true, force: true }) }
