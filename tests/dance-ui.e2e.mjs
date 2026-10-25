import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, access, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const root = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url)
const userData = await mkdtemp(resolve(tmpdir(), 'debby-dance-'))
let app, page
const errors = []
const videoPath = process.env.DEBBY_DANCE_TEST_VIDEO || resolve(root, 'work/pose-source.mp4')
if (!process.env.DEBBY_DANCE_TEST_VIDEO) {
  if (!await access(videoPath).then(() => true, () => false)) execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '90', '--output', videoPath, 'https://mediapipe.dev/images/mobile/pose_world_landmarks.mp4'])
  assert.equal(createHash('sha256').update(await readFile(videoPath)).digest('hex'), 'e06e2ec9a2c1e6e15de0de1bf68740b3dd5f216adb416a9015865d0c4cd164ca')
}
try {
  app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root,
    env: { ...process.env, FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo' } })
  page = await app.firstWindow()
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') console.log('Renderer:', m.text()) })
  await page.waitForSelector('[data-3d-ready=true]', { timeout: 30000 })
  const studio = async () => {
    await page.locator('[title="桌宠选项"]').click()
    await page.locator('[title="学跳舞"]').click()
    await page.waitForSelector('.dance-dialog[open]')
  }
  await studio()
  await page.screenshot({ path: resolve(root, 'work/dance-studio.png') })
  await page.getByRole('checkbox', { name: '循环', exact: true }).check()
  await page.locator('[title="播放 Debby 的小小律动"]').click()
  await page.waitForSelector('.app-compact [data-view=full][data-dance-id=welcome]')
  await page.waitForTimeout(500)
  const hand = await page.locator('.three-pet-host').getAttribute('data-dance-hand')
  await page.waitForFunction(previous => document.querySelector('.three-pet-host').dataset.danceHand !== previous, hand)
  await page.locator('[title="暂停跳舞"]').click()
  await page.waitForFunction(async () => (await window.finpet.getDanceState()).playback.status === 'paused')
  await page.waitForTimeout(400)
  const paused = await page.locator('.three-pet-host').getAttribute('data-dance-pose')
  await page.waitForTimeout(500)
  assert.equal(await page.locator('.three-pet-host').getAttribute('data-dance-pose'), paused, 'Pause must hold the actual rig pose')
  await page.getByRole('slider', { name: '舞蹈播放进度' }).fill('4')
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.danceTime) === 4)
  await page.screenshot({ path: resolve(root, 'work/dance-builtin.png') })
  await page.locator('[title="继续跳舞"]').click()
  const bounds = await page.locator('.three-pet-host').boundingBox()
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 24, bounds.y + bounds.height / 2 + 12, { steps: 5 }); await page.mouse.up()
  await page.locator('[title="停止跳舞"]').click()
  await page.waitForSelector('[data-view=portrait]')
  await page.waitForFunction(() => document.querySelector('.three-pet-host').dataset.behavior !== 'lifted')
  await studio()
  await page.locator('[aria-label="选择舞蹈视频"]').setInputFiles(videoPath)
  await page.waitForFunction(() => document.querySelector('.dance-video video').readyState >= 2)
  const seconds = Number(process.env.DEBBY_DANCE_TEST_SECONDS || 2.5)
  await page.getByRole('spinbutton', { name: '舞蹈结束秒数' }).fill(String(seconds))
  await page.getByRole('textbox', { name: '舞蹈名称' }).fill('本地识别验证')
  await page.getByRole('button', { name: '开始学习', exact: true }).click()
  await page.waitForSelector('.dance-success', { timeout: 120000 })
  const state = await page.evaluate(() => window.finpet.getDanceState())
  const entry = state.library.find(e => e.source === 'video')
  assert.ok(entry?.quality.coverage >= .55, JSON.stringify(state))
  const asset = await page.evaluate(id => window.finpet.getDanceAsset(id), entry.id)
  assert.ok(asset.motion.tracks.some(t => Math.max(...t.rotations.filter((_, i) => i % 4 === 0)) - Math.min(...t.rotations.filter((_, i) => i % 4 === 0)) > .01), 'Real video must produce changing joint rotations')
  await page.screenshot({ path: resolve(root, 'work/dance-recognition.png') })
  // Cancelling inference must not create a partial entry.
  await page.getByRole('button', { name: '开始学习', exact: true }).click()
  await page.getByRole('button', { name: '取消学习', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.dance-learn-row button').disabled)
  assert.equal((await page.evaluate(() => window.finpet.getDanceState())).library.length, state.library.length)
  await page.getByRole('button', { name: '开始学习', exact: true }).click()
  await app.evaluate(({ powerMonitor }) => powerMonitor.emit('lock-screen'))
  await page.waitForFunction(() => !document.querySelector('.dance-learn-row button').disabled)
  assert.equal((await page.evaluate(() => window.finpet.getDanceState())).library.length, state.library.length, 'Locking must cancel capture without saving a partial dance')
  await page.locator('[title="播放 本地识别验证"]').click()
  await page.waitForSelector(`[data-dance-id="${entry.id}"][data-view=full]`)
  await page.waitForTimeout(600)
  await page.screenshot({ path: resolve(root, 'work/dance-learned.png') })
  if (process.env.DEBBY_CAPTURE_DANCE) {
    const recording = await page.evaluate(async seconds => {
      const source = document.querySelector('.three-pet-canvas'), canvas = document.createElement('canvas'), chunks = []
      canvas.width = source.width; canvas.height = source.height
      const context = canvas.getContext('2d'), gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
      gradient.addColorStop(0, '#fff5f9'); gradient.addColorStop(1, '#e9edf9')
      let frame
      const draw = () => { context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, 0, 0); frame = requestAnimationFrame(draw) }
      draw()
      const stream = canvas.captureStream(30), recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 2500000 })
      const done = new Promise(resolve => { recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = resolve })
      recorder.start(); await new Promise(resolve => setTimeout(resolve, seconds * 1000)); recorder.stop(); await done; cancelAnimationFrame(frame); stream.getTracks().forEach(t => t.stop())
      return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))
    }, Math.min(5, seconds - .8))
    await writeFile(resolve(root, 'work/dance-learned.webm'), new Uint8Array(recording))
  }
  if (await page.locator('[title="停止跳舞"]').isVisible()) await page.locator('[title="停止跳舞"]').click()
  else assert.equal((await page.evaluate(() => window.finpet.getDanceState())).playback, undefined, 'A non-looping dance must finish automatically')
  const stored = JSON.parse(await readFile(resolve(userData, 'dances', `${entry.id}.json`), 'utf8'))
  assert.equal(stored.motion.name, entry.name)
  assert.equal(stored.video, undefined)
  await studio()
  await page.locator('[aria-label="导入舞蹈动作"]').setInputFiles({ name: 'VRMA 验证.vrma', mimeType: 'application/octet-stream', buffer: makeVrma() })
  await page.waitForSelector('[title="播放 VRMA 验证"]')
  await page.locator('[title="播放 VRMA 验证"]').click()
  await page.waitForFunction(() => document.querySelector('.three-pet-host').dataset.danceId && document.querySelector('.three-pet-host').dataset.danceId !== 'welcome')
  await page.locator('[title="暂停跳舞"]').click()
  await page.getByRole('slider', { name: '舞蹈播放进度' }).fill('2')
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.danceTime) === 2)
  await page.getByRole('slider', { name: '舞蹈播放进度' }).fill('0.5')
  await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.danceTime) === .5)
  await page.locator('[title="停止跳舞"]').click()
  await studio()
  const roundtrip = resolve(root, 'work/dance-roundtrip.json')
  await app.evaluate(({ BrowserWindow }, path) => {
    globalThis.danceDownload = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Dance export timed out')), 10000)
      BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, item) => {
        item.setSavePath(path)
        item.once('done', (_event, state) => { clearTimeout(timer); state === 'completed' ? resolve(path) : reject(Error(`Download ${state}`)) })
      })
    })
  }, roundtrip)
  await page.locator('[title="导出 本地识别验证"]').click()
  assert.equal(await app.evaluate(() => globalThis.danceDownload), roundtrip)
  await page.locator('[aria-label="导入舞蹈动作"]').setInputFiles(roundtrip)
  await page.waitForFunction(async () => (await window.finpet.getDanceState()).library.length === 4)
  await page.locator('[title="关闭舞蹈工作室"]').click()
  await app.close(); app = undefined
  app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env: { ...process.env, FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo' } })
  page = await app.firstWindow(); await page.waitForSelector('[data-3d-ready=true]', { timeout: 30000 })
  assert.equal((await page.evaluate(() => window.finpet.getDanceState())).library.length, 4)
  assert.deepEqual(errors, [])
  console.log('Dance desktop E2E passed:', JSON.stringify({ quality: entry.quality, bones: asset.motion.tracks.length, localModel: true, pauseHoldsRig: true, portraitRestored: true, vrma: true, cancellation: true, importExport: true, restartPersistence: true }))
} catch (error) {
  if (page) {
    await page.screenshot({ path: resolve(root, 'work/dance-failure.png') }).catch(() => {})
    console.log('Dance UI failure:', (await page.locator('.dance-dialog').innerText().catch(() => page.locator('body').innerText())).slice(-3000), errors)
  }
  throw error
} finally { await app?.close(); await rm(userData, { recursive: true, force: true }) }

function makeVrma() {
  const floats = new Float32Array([0, 2, 0, 0, 0, 1, 0, 0, Math.sin(-.5), Math.cos(-.5)])
  const json = { asset: { version: '2.0' }, extensionsUsed: ['VRMC_vrm_animation'], extensions: { VRMC_vrm_animation: { specVersion: '1.0', humanoid: { humanBones: { hips: { node: 0 }, leftUpperArm: { node: 1 } } } } },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'hips', translation: [0, 1, 0], children: [1] }, { name: 'leftArm', translation: [.2, .5, 0] }],
    buffers: [{ byteLength: floats.byteLength }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: 32 }],
    accessors: [{ bufferView: 0, componentType: 5126, type: 'SCALAR', count: 2 }, { bufferView: 1, componentType: 5126, type: 'VEC4', count: 2 }],
    animations: [{ samplers: [{ input: 0, output: 1 }], channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }] }] }
  const jsonBytes = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(jsonBytes.length / 4) * 4, 32); jsonBytes.copy(padded)
  const bytes = Buffer.alloc(28 + padded.length + floats.byteLength)
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8)
  bytes.writeUInt32LE(padded.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); padded.copy(bytes, 20)
  bytes.writeUInt32LE(floats.byteLength, 20 + padded.length); bytes.writeUInt32LE(0x004e4942, 24 + padded.length); Buffer.from(floats.buffer).copy(bytes, 28 + padded.length)
  return bytes
}
