import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright'
import { build } from 'esbuild'
import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url)
const userData = await mkdtemp(resolve(tmpdir(), 'debby-skeleton-')), evidence = resolve(root, 'work/avatar-skeleton')
await mkdir(evidence, { recursive: true })
let app
const errors = [], measurements = [], tiles = [], faces = [], contacts = []
try {
  app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root,
    env: { ...process.env, FINPET_E2E_USER_DATA: userData, FINPET_E2E_BACKGROUND: '1', FINPET_MARKET_SOURCE: 'demo' } })
  const page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message))
  await page.waitForSelector('[data-3d-ready=true]', { timeout: 30000 })
  const bundle = await build({ stdin: { contents: "export { createStandRigSurface } from './src/renderer/src/avatar/standrig-runtime'; export { importStandRig } from './src/renderer/src/avatar/standrig-import'", resolveDir: root }, bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'SkeletonTest' })
  await page.evaluate(bundle.outputFiles[0].text + ';globalThis.SkeletonTest = SkeletonTest')
  const pack = JSON.parse(await readFile(resolve(root, 'src/renderer/public/models/whale-girl/debby-whale-girl-rigged.srig'), 'utf8'))
  await page.evaluate(pack => { globalThis.skeletonPack = pack }, pack)
  for (const [row, emotion] of ['neutral', 'shy', 'caring', 'proud'].entries()) {
    const samples = await page.evaluate(async emotion => {
      const rig = SkeletonTest.importStandRig(globalThis.skeletonPack), canvas = document.createElement('canvas')
      const driver = await SkeletonTest.createStandRigSurface(rig, canvas)
      const base = { angleX: 0, angleY: 0, angleZ: 0, eyeX: 0, eyeY: 0, breath: 0, body: 0, mouthOpen: 0, mouthForm: 0, brow: 0 }
      const expression = { id: 'qa', emotion, intensity: 1, source: 'preview', expiresAt: Number.MAX_SAFE_INTEGER }
      const pixel = () => canvas.getContext('2d').getImageData(0, 0, 800, 1280).data
      const difference = (a, b, x0 = 0, y0 = 0, x1 = 800, y1 = 1280) => {
        let delta = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 4; c++) delta += Math.abs(a[(y * 800 + x) * 4 + c] - b[(y * 800 + x) * 4 + c])
        return delta / ((x1 - x0) * (y1 - y0) * 4)
      }
      driver.frame(base, 0, 0, expression, { reducedMotion: true }); const center = canvas.toDataURL(), neutral = pixel()
      const source = document.createElement('canvas'); source.width = 800; source.height = 1280
      const mesh = globalThis.skeletonPack.parts.find(p => p.id === globalThis.skeletonPack.metadata.debby.skeleton.poseParts[emotion][0])
      const image = new Image(); image.src = globalThis.skeletonPack.assets.find(a => a.id === mesh.assetId).src; await image.decode(); source.getContext('2d').drawImage(image, 0, 0)
      const identityDelta = difference(neutral, source.getContext('2d').getImageData(0, 0, 800, 1280).data)
      driver.frame({ ...base, eyeX: -1 }, 0, 0, expression); const eyeLeft = pixel()
      driver.frame({ ...base, eyeX: 1 }, 0, 0, expression); const eyeRight = pixel()
      const eyeDelta = difference(eyeLeft, eyeRight, 310, 120, 490, 250), torsoIsolation = difference(eyeLeft, eyeRight, 200, 550, 600, 1100)
      const capture = (params, time, overlay = false) => {
        for (let i = 0; i < 30; i++) driver.frame({ ...base, ...params }, 1 / 60, time, expression, { showSkeleton: overlay })
        return canvas.toDataURL()
      }
      const left = capture({ angleX: -.65, angleY: -.25, eyeX: -.8, angleZ: -.25 }, 1)
      const right = capture({ angleX: .65, angleY: .25, eyeX: .8, angleZ: .25 }, 2)
      const body = capture({ body: .2, breath: 1 }, 4)
      const overlay = capture({ angleX: .3, eyeX: .5 }, 4, true)
      const overlayPixels = pixel(); let overlayPinkPixels = 0
      for (let i = 0; i < overlayPixels.length; i += 4) if (overlayPixels[i] === 255 && overlayPixels[i + 1] === 92 && overlayPixels[i + 2] === 158 && overlayPixels[i + 3] === 255) overlayPinkPixels++
      const extremeLeft = capture({ angleX: -1, angleY: -1, angleZ: -1, eyeX: -1, eyeY: -1, body: -.5, breath: 1 }, 5)
      const extremeRight = capture({ angleX: 1, angleY: 1, angleZ: 1, eyeX: 1, eyeY: 1, body: .5, breath: 1 }, 6)
      const started = performance.now()
      for (let i = 0; i < 30; i++) driver.frame({ ...base, angleX: Math.sin(i / 10), breath: .5 }, 1 / 30, i / 30, expression)
      const frameMs = (performance.now() - started) / 30
      driver.dispose()
      return { center, left, right, body, overlay, extremeLeft, extremeRight, identityDelta, eyeDelta, torsoIsolation, frameMs, overlayPinkPixels }
    }, emotion)
    measurements.push({ emotion, ...Object.fromEntries(['identityDelta', 'eyeDelta', 'torsoIsolation', 'frameMs', 'overlayPinkPixels'].map(key => [key, samples[key]])) })
    assert.ok(samples.identityDelta < 1.5, `${emotion}: source identity ${samples.identityDelta}`)
    assert.ok(samples.eyeDelta > .15, `${emotion}: eye patch responds ${samples.eyeDelta}`)
    assert.ok(samples.torsoIsolation < .01, `${emotion}: eye patch cannot move torso ${samples.torsoIsolation}`)
    assert.ok(samples.overlayPinkPixels > 500, `${emotion}: evaluated skeleton must draw actual joint/connection pixels`)
    assert.notEqual(samples.left, samples.right)
    for (const [column, key] of ['left', 'center', 'right', 'body', 'overlay'].entries()) {
      const bytes = Buffer.from(samples[key].split(',')[1], 'base64')
      await writeFile(resolve(evidence, `${emotion}-${key}.png`), bytes)
      tiles.push({ input: await sharp(bytes).resize(320, 512).flatten({ background: '#f5f1eb' }).png().toBuffer(), left: column * 320, top: row * 512 })
    }
    for (const [column, key] of ['extremeLeft', 'center', 'extremeRight'].entries()) {
      const bytes = Buffer.from(samples[key].split(',')[1], 'base64')
      faces.push({ input: await sharp(bytes).extract({ left: 210, top: 30, width: 390, height: 340 }).flatten({ background: '#f5f1eb' }).png().toBuffer(), left: column * 390, top: row * 340 })
      contacts.push({ input: await sharp(bytes).extract({ left: 190, top: 250, width: 430, height: 450 }).flatten({ background: '#f5f1eb' }).png().toBuffer(), left: column * 430, top: row * 450 })
    }
  }
  await sharp({ create: { width: 1600, height: 2048, channels: 4, background: '#f5f1eb' } }).composite(tiles).png().toFile(resolve(evidence, 'skeleton-contact.png'))
  await sharp({ create: { width: 1170, height: 1360, channels: 4, background: '#f5f1eb' } }).composite(faces).png().toFile(resolve(evidence, 'face-extremes.png'))
  await sharp({ create: { width: 1290, height: 1800, channels: 4, background: '#f5f1eb' } }).composite(contacts).png().toFile(resolve(evidence, 'attachment-extremes.png'))
  await writeFile(resolve(evidence, 'measurements.json'), JSON.stringify(measurements, null, 2))
  await page.getByTitle('桌宠选项', { exact: true }).click(); await page.getByTitle('角色工坊', { exact: true }).click()
  await page.getByRole('button', { name: '遇见鲸鱼娘', exact: false }).click()
  await page.waitForSelector('.avatar-preview [data-skeleton-joints="21"][data-layered-ready=true]', { timeout: 30000 })
  await page.getByRole('button', { name: '显示骨架', exact: true }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25))
  await page.waitForFunction(() => devicePixelRatio === 1.25)
  await page.screenshot({ path: resolve(evidence, 'studio-bones.png') })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1))
  await page.getByRole('button', { name: '隐藏骨架', exact: true }).click()
  await page.getByRole('button', { name: '试试说话动作', exact: true }).click()
  await page.waitForSelector('.avatar-preview [data-behavior=talking]')
  const pose = await page.locator('.avatar-preview .layered-pet-host').getAttribute('data-skeleton-pose')
  await page.waitForFunction(pose => document.querySelector('.avatar-preview .layered-pet-host').dataset.skeletonPose !== pose, pose)
  await page.getByRole('button', { name: '停止试动作', exact: true }).click()
  await page.getByRole('button', { name: '用这个角色陪我', exact: true }).click(); await page.getByTitle('关闭角色工坊').click()
  await page.waitForSelector('.pet-wrap [data-portrait-motion=skeleton]')
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForSelector('.pet-wrap [data-portrait-motion=reduced]')
  assert.equal((await page.evaluate(() => window.finpet.getVoiceState())).active, false)
  assert.deepEqual(await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; return { visible: win.isVisible(), focused: win.isFocused(), muted: win.webContents.isAudioMuted() } }), { visible: false, focused: false, muted: true })
  assert.deepEqual(errors, [])
  console.log('Hidden skeleton E2E passed: real skinned pixels, source identity, isolated eyes, joint preview, talking, reduced motion; no devices/audio/focus.')
  console.log(JSON.stringify(measurements))
} finally { await app?.close(); await rm(userData, { recursive: true, force: true }) }
