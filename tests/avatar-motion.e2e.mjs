import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'
import { build } from 'esbuild'
import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url)
const userData = await mkdtemp(resolve(tmpdir(), 'debby-motion-')), evidence = resolve(root, 'work/avatar-motion')
await mkdir(evidence, { recursive: true })
let app
const errors = []
try {
  // Native window stays hidden, unfocusable and muted. Only CDP input and a fake cursor reader are used.
  app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env: { ...process.env, FINPET_E2E_USER_DATA: userData, FINPET_E2E_BACKGROUND: '1', FINPET_MARKET_SOURCE: 'demo' } })
  const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message))
  await page.waitForSelector('[data-3d-ready=true]', { timeout: 30000 })
  await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0]
    globalThis.motionTest = { cursor: { x: 0, y: 0 }, visible: win.isVisible.bind(win) }
    screen.getCursorScreenPoint = () => globalThis.motionTest.cursor
    win.isVisible = () => true
    win.emit('show')
  })
  const cursor = (x, y) => app.evaluate(({ BrowserWindow }, point) => {
    const bounds = BrowserWindow.getAllWindows()[0].getBounds()
    globalThis.motionTest.cursor = { x: bounds.x + point.x, y: bounds.y + point.y }
  }, { x, y })
  await cursor(25, 40)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25))
  const scaled = await page.evaluate(() => window.finpet.getCursorPosition())
  assert.deepEqual(scaled, { x: 20, y: 32, source: 'desktop' }, 'DIP cursor converts to viewport CSS pixels')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1))
  await page.evaluate(() => { globalThis.pointerEvents = 0; window.addEventListener('pointermove', () => globalThis.pointerEvents++) })
  await cursor(-1600, 170)
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.gaze.split(':')[0]) < -.8)
  const leftPose = await page.locator('.three-pet-host').getAttribute('data-gesture-pose')
  await cursor(1900, 170)
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.gaze.split(':')[0]) > .8)
  assert.notEqual(await page.locator('.three-pet-host').getAttribute('data-gesture-pose'), leftPose)
  assert.equal(await page.evaluate(() => globalThis.pointerEvents), 0, 'Outside-window gaze needs no host pointermove')
  await page.evaluate(() => window.finpet.setClickThrough(true)); await cursor(-1600, 170)
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.gaze.split(':')[0]) < -.8)
  await page.evaluate(() => window.finpet.setClickThrough(false))

  // Render actual packaged art through the GPU shader, with deterministic inputs for pixel QA.
  const bundle = await build({ entryPoints: [resolve(root, 'src/renderer/src/avatar/portrait-motion.ts')], bundle: true, write: false, format: 'iife', globalName: 'PortraitTest', platform: 'browser' })
  await page.evaluate(bundle.outputFiles[0].text + ';globalThis.PortraitTest = PortraitTest')
  const pack = JSON.parse(await readFile(resolve(root, 'src/renderer/public/models/whale-girl/debby-whale-girl.srig'), 'utf8'))
  const sheet = [], measurements = []
  for (const [row, emotion] of ['neutral', 'shy', 'caring', 'proud'].entries()) {
    const asset = pack.assets.find(asset => asset.id === pack.parts.find(part => part.id === emotion).assetId)
    const samples = await page.evaluate(async ({ src, binding, emotion }) => {
      const source = document.createElement('canvas'); source.width = 800; source.height = 1280
      const image = new Image(); image.src = src; await image.decode(); source.getContext('2d').drawImage(image, 0, 0)
      const surface = globalThis.PortraitTest.createPortraitMotion(800, 1280, binding); surface.upload(source)
      const read = () => { const c = document.createElement('canvas'); c.width = 800; c.height = 1280; c.getContext('2d').drawImage(surface.canvas, 0, 0); return c }
      const params = { angleX: 0, angleY: 0, angleZ: 0, eyeX: 0, eyeY: 0, breath: 0, body: 0 }
      surface.render(params, emotion); const center = read(), original = source.getContext('2d').getImageData(0, 0, 800, 1280).data
      const baseline = center.getContext('2d').getImageData(0, 0, 800, 1280).data
      let identityDelta = 0; for (let i = 0; i < original.length; i++) identityDelta += Math.abs(original[i] - baseline[i])
      surface.render({ ...params, eyeX: -.6 }, emotion); const eyeLeft = read().getContext('2d').getImageData(0, 0, 800, 1280).data
      surface.render({ ...params, eyeX: .6 }, emotion); const eyeRight = read().getContext('2d').getImageData(0, 0, 800, 1280).data
      let eyeDelta = 0, bodyDelta = 0
      for (let y = 110; y < 250; y++) for (let x = 300; x < 500; x++) for (let c = 0; c < 4; c++) eyeDelta += Math.abs(eyeLeft[(y * 800 + x) * 4 + c] - eyeRight[(y * 800 + x) * 4 + c])
      for (let y = 500; y < 1000; y++) for (let x = 200; x < 600; x++) for (let c = 0; c < 4; c++) bodyDelta += Math.abs(eyeLeft[(y * 800 + x) * 4 + c] - eyeRight[(y * 800 + x) * 4 + c])
      surface.render({ ...params, angleX: -.35, eyeX: -.6, angleZ: -.08 }, emotion); const left = read().toDataURL()
      surface.render({ ...params, angleX: .35, eyeX: .6, angleZ: .08 }, emotion); const right = read().toDataURL()
      surface.dispose()
      return { center: center.toDataURL(), left, right, identityDelta: identityDelta / original.length, eyeDelta: eyeDelta / (200 * 140 * 4), bodyDelta: bodyDelta / (400 * 500 * 4) }
    }, { src: asset.src, binding: pack.metadata.debby.motion, emotion })
    assert.ok(samples.identityDelta < 1.5, `${emotion}: orientation, colors and alpha match the source (${samples.identityDelta})`)
    assert.ok(samples.eyeDelta > .2, `${emotion}: eye-region pixels actually move (${samples.eyeDelta})`)
    assert.ok(samples.bodyDelta < .01, `${emotion}: eye motion must leave the torso unchanged`)
    measurements.push({ emotion, identityDelta: samples.identityDelta, eyeDelta: samples.eyeDelta, bodyDelta: samples.bodyDelta })
    for (const [column, key] of ['left', 'center', 'right'].entries()) {
      const bytes = Buffer.from(samples[key].split(',')[1], 'base64')
      await writeFile(resolve(evidence, `${emotion}-${key}.png`), bytes)
      sheet.push({ input: await sharp(bytes).extract({ left: 240, top: 60, width: 320, height: 300 }).resize(480, 450).flatten({ background: '#f5f1eb' }).png().toBuffer(), left: column * 480, top: row * 450 })
    }
  }
  await sharp({ create: { width: 1440, height: 1800, channels: 4, background: '#f5f1eb' } }).composite(sheet).png().toFile(resolve(evidence, 'gaze-contact.png'))
  await writeFile(resolve(evidence, 'measurements.json'), JSON.stringify(measurements, null, 2))
  await page.getByTitle('桌宠选项', { exact: true }).click(); await page.getByTitle('角色工坊', { exact: true }).click()
  await page.getByRole('button', { name: '遇见鲸鱼娘', exact: false }).click()
  await page.waitForSelector('.avatar-preview [data-portrait-motion=active][data-layered-ready=true]', { timeout: 30000 })
  await cursor(-1600, 170)
  await page.waitForFunction(() => Number(document.querySelector('.avatar-preview .layered-pet-host').dataset.gaze.split(':')[0]) < -.8)
  await page.waitForSelector('.avatar-preview [data-behavior=nod]', { timeout: 24000 })
  await page.getByRole('button', { name: '试试说话动作', exact: true }).click()
  await page.waitForSelector('.avatar-preview [data-behavior=talking]')
  await page.screenshot({ path: resolve(evidence, 'speaking.png') })
  await page.getByRole('button', { name: '停止试动作', exact: true }).click()
  await page.getByRole('button', { name: '用这个角色陪我', exact: true }).click()
  await page.getByTitle('关闭角色工坊').click()
  await page.waitForSelector('.pet-wrap [data-portrait-motion=active]')
  await cursor(1900, 170)
  await page.waitForFunction(() => Number(document.querySelector('.pet-wrap .layered-pet-host').dataset.gaze.split(':')[0]) > .8)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForSelector('.pet-wrap [data-portrait-motion=reduced]')
  assert.equal((await page.evaluate(() => window.finpet.getVoiceState())).active, false)
  assert.deepEqual(await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; return { visible: globalThis.motionTest.visible(), focused: win.isFocused(), muted: win.webContents.isAudioMuted() } }), { visible: false, focused: false, muted: true })
  assert.deepEqual(errors, [])
  console.log('Background motion E2E passed: native off-window/zoom/click-through gaze; real eye pixels; torso isolation; idle->talking priority; reduced motion; no focus/audio/devices.')
  console.log(JSON.stringify(measurements))
} catch (error) {
  if (app) console.error(await (await app.firstWindow()).evaluate(() => ({ hidden: document.hidden, hosts: [...document.querySelectorAll('.layered-pet-host, .three-pet-host')].map(host => ({ ...host.dataset })) })).catch(() => ({})))
  throw error
} finally { await app?.close(); await rm(userData, { recursive: true, force: true }) }
