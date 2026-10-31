import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'
import { DebbyClient } from '../integrations/client.mjs'
import { waitForNativePosition } from './electron-helpers.mjs'

const root = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url)
const userData = await mkdtemp(resolve(tmpdir(), 'debby-standrig-'))
let app, harness
const errors = []
try {
  app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env: { ...process.env, FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo' } })
  const page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForSelector('[data-3d-ready=true]', { timeout: 30000 })
  const open = async () => { await page.getByTitle('桌宠选项', { exact: true }).click(); await page.getByTitle('角色工坊', { exact: true }).click() }
  const ready = '.avatar-preview [data-engine=standrig][data-layered-ready=true]'
  await open()
  const file = page.getByLabel('导入角色 PSD', { exact: true })
  await file.setInputFiles({ name: 'broken.srig', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":"future"}') })
  await page.getByRole('alert').filter({ hasText: '模型版本' }).waitFor()
  assert.equal(await page.locator('.pet-wrap [data-3d-ready=true]').count(), 1)
  await page.getByRole('button', { name: '遇见鲸鱼娘', exact: false }).click()
  await page.waitForSelector(ready, { timeout: 30000 })
  assert.equal(await page.getByRole('button', { name: '试试口型', exact: true }).count(), 0)
  await page.getByRole('button', { name: '查看全身', exact: true }).click()
  await page.waitForSelector('.avatar-preview [data-rendered-view=full]')
  const original = JSON.parse(await readFile(resolve(root, 'src/renderer/public/models/whale-girl/debby-whale-girl.srig'), 'utf8'))
  // Compare real pixels with a single source illustration; catches opaque/ghosted idle layers.
  for (const emotion of ['neutral', 'happy', 'shy', 'caring', 'surprised', 'proud']) {
    await page.getByLabel('预览表情').selectOption(emotion)
    await page.waitForFunction(emotion => document.querySelector('.avatar-preview .layered-pet-host')?.dataset.renderedExpression === emotion, emotion)
    const assetId = original.parts.find(p => p.id === emotion).assetId
    const difference = await page.evaluate(async ({ src }) => {
      const output = document.querySelector('.avatar-preview .layered-pet-canvas')
      const expected = document.createElement('canvas'); expected.width = output.width; expected.height = output.height
      const context = expected.getContext('2d'), image = new Image()
      image.src = src; await image.decode()
      const scale = Math.min(output.width / 800, output.height / 1280), w = 800 * scale, h = 1280 * scale
      context.drawImage(image, (output.width - w) / 2, output.height - h, w, h)
      const a = output.getContext('2d').getImageData(0, 0, output.width, output.height).data
      const b = context.getImageData(0, 0, output.width, output.height).data
      let diff = 0, visible = 0
      for (let i = 0; i < a.length; i++) { diff += Math.abs(a[i] - b[i]); if (i % 4 === 3 && a[i] > 10) visible++ }
      return { mean: diff / a.length, visible }
    }, { src: original.assets.find(a => a.id === assetId).src })
    assert.ok(difference.visible > 1000, 'Actual avatar pixels exist')
    assert.ok(difference.mean < 1.5, `${emotion}: should render one illustration, pixel delta ${difference.mean}`)
  }
  await page.getByLabel('预览表情').selectOption('shy')
  await page.getByRole('button', { name: '查看上半身', exact: true }).click()
  await page.screenshot({ path: resolve(root, 'work/whale-girl/studio.png') })
  await page.getByRole('button', { name: '用这个角色陪我', exact: true }).click()
  await page.waitForSelector('.pet-wrap [data-engine=standrig][data-layered-ready=true]', { timeout: 30000 })
  await page.getByTitle('关闭角色工坊').click()
  await page.reload(); await page.waitForSelector('.pet-wrap [data-engine=standrig][data-layered-ready=true]', { timeout: 30000 })
  await page.evaluate(() => window.finpet.enableShell(true))
  harness = new DebbyClient(resolve(userData, 'agent-bridge.json'), 'Whale-girl E2E')
  await harness.setTask('whale-task', '陪你看懂行情', 'working')
  await harness.say('whale-task', 'whale-shy', '谢谢你喜欢我呀。', { expression: { emotion: 'shy', intensity: .7 } })
  await page.waitForSelector('.pet-wrap [data-emotion=shy][data-rendered-expression=shy]')
  await harness.say('whale-task', 'whale-caring', '辛苦啦，先陪你歇一会儿。', { expression: { emotion: 'caring', intensity: .8 } })
  await page.waitForSelector('.pet-wrap [data-rendered-expression=caring]')
  await page.screenshot({ path: resolve(root, 'work/whale-girl/desktop.png') })
  await page.evaluate(() => window.finpet.cancelShellTask())
  await page.waitForFunction(() => document.querySelector('.pet-wrap .layered-pet-host').dataset.emotion === '')
  await harness.release(); harness = undefined
  await page.evaluate(() => window.finpet.controlDance({ action: 'play', id: 'welcome' }))
  await page.waitForSelector('.pet-wrap [data-3d-ready=true]', { timeout: 30000 })
  await page.evaluate(() => window.finpet.controlDance({ action: 'stop' }))
  await page.waitForSelector('.pet-wrap [data-engine=standrig][data-layered-ready=true]', { timeout: 30000 })
  // Full-body/portrait drawing must retain ordinary pointer window dragging.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setPosition(300, 180))
  const pet = await page.locator('.pet-wrap .layered-pet-host').boundingBox()
  await page.mouse.move(pet.x + pet.width / 2, pet.y + pet.height / 2); await page.mouse.down()
  await page.mouse.move(pet.x + pet.width / 2 - 30, pet.y + pet.height / 2 - 20); await page.mouse.up()
  await waitForNativePosition(app, 270, 160)
  assert.equal((await page.evaluate(() => window.finpet.getVoiceState())).active, false)
  await open(); await page.getByRole('button', { name: '使用原来的 3D', exact: true }).click()
  await page.waitForSelector('.pet-wrap [data-3d-ready=true]', { timeout: 30000 })
  assert.deepEqual(errors, [])
  console.log('StandRig real-art E2E passed: pixels match source, expressions, local persistence, Agent/cancel, dance restoration, drag, no devices.')
} finally { await harness?.release().catch(() => {}); await app?.close(); await rm(userData, { recursive: true, force: true }) }
