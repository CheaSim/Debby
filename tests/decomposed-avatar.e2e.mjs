import assert from 'node:assert/strict'
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { _electron as electron } from 'playwright'
import sharp from 'sharp'
import { DebbyClient } from '../integrations/client.mjs'

const root = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url)
const input = resolve(root, process.env.DEBBY_DECOMPOSED_PSD || 'src/renderer/public/models/whale-girl/debby-whale-girl.psd')
const bytes = await readFile(input), evidence = resolve(root, 'work/decomposed-avatar')
const userData = await mkdtemp(resolve(tmpdir(), 'debby-parts-'))
await mkdir(evidence, { recursive: true })
let app, harness
try {
  app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env: { ...process.env, FINPET_E2E_USER_DATA: userData, FINPET_E2E_BACKGROUND: '1', FINPET_MARKET_SOURCE: 'demo' } })
  const page = await app.firstWindow(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.waitForSelector('[data-3d-ready=true]', { timeout: 30000 })
  for (const name of ['runtime.js', 'rigger.js', 'renderer.js', 'debby-rig.js']) await page.addScriptTag({ url: await page.evaluate(name => new URL('vendor/anime25d/' + name, document.baseURI).href, name) })
  const result = await page.evaluate(async base64 => {
    const rig = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('vendor/anime25d/debby-worker.js', document.baseURI))
      worker.onerror = e => { worker.terminate(); reject(Error(e.message)) }
      worker.onmessage = ({ data }) => { if (data.rig || data.error) { worker.terminate(); data.error ? reject(Error(data.error)) : resolve(data.rig) } }
      const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer; worker.postMessage(buffer, [buffer])
    })
    const canvas = document.createElement('canvas'); canvas.width = rig.canvas.w; canvas.height = rig.canvas.h
    const output = document.createElement('canvas'); output.width = canvas.width; output.height = canvas.height
    const ctx = output.getContext('2d'), driver = DebbyRig.create(canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true }), rig)
    const params = { eyeOpenL: 1, eyeOpenR: 1, physAmp: 0, fhAmp: 0, accAmp: 0, soft: 0, breath: 0, breathHead: 0 }
    function shot(extra = {}, hiddenLayers = [], time = 1) {
      driver.frame({ ...params, ...extra }, 0, time, undefined, { hiddenLayers, reducedMotion: true })
      ctx.clearRect(0, 0, output.width, output.height); ctx.drawImage(canvas, 0, 0)
      return { data: ctx.getImageData(0, 0, output.width, output.height).data, png: output.toDataURL() }
    }
    const role = name => rig.layers.filter(l => Rigger.baseName(l.name.replace(/_(l|r)$/, '')) === name).map(l => l.z)
    const base = shot(), left = shot({ eyeX: -1 }), right = shot({ eyeX: 1 }), open = shot({ mouthOpen: 1 }), blink = shot({ eyeOpenL: 0, eyeOpenR: 0 })
    const face = rig.anchors.face
    function delta(a, b, region) {
      const { x0, x1, y0, y1 } = region; let sum = 0, n = 0
      for (let y = Math.max(0, Math.floor(y0)); y < Math.min(canvas.height, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(canvas.width, x1); x++) { const offset = (y * canvas.width + x) * 4; for (let c = 0; c < 4; c++) sum += Math.abs(a[offset + c] - b[offset + c]); n += 4 }
      return sum / Math.max(n, 1)
    }
    const body = { x0: 0, x1: canvas.width, y0: canvas.height * .4, y1: canvas.height }
    const noHair = shot({}, [...role('front hair'), ...role('back hair')])
    const noFace = shot({}, role('face')), noTail = shot({}, role('tail'))
    const tilt = shot({ angleX: .65, angleY: .4, angleZ: -.4 })
    const reducedA = shot({}, [], 1), reducedB = shot({}, [], 20)
    const greet = shot({ armY: .8, breath: 1 })
    driver.dispose()
    return { canvas: rig.canvas, layers: rig.layers.map(l => ({ name: l.name, z: l.z })), synth: rig.synth, warnings: rig.warnings,
      anchors: rig.anchors, metrics: { eyeFace: delta(left.data, right.data, face), eyeBody: delta(left.data, right.data, body), mouthFace: delta(base.data, open.data, face), blinkFace: delta(base.data, blink.data, face), faceLayer: delta(base.data, noFace.data, face), tailLayer: delta(base.data, noTail.data, body), reduced: delta(reducedA.data, reducedB.data, { x0: 0, y0: 0, x1: canvas.width, y1: canvas.height }) },
      images: { base: base.png, left: left.png, right: right.png, open: open.png, blink: blink.png, noHair: noHair.png, tilt: tilt.png, greet: greet.png } }
  }, bytes.toString('base64'))
  const original = JSON.parse(await readFile(resolve(root, 'src/renderer/public/models/whale-girl/debby-whale-girl.srig'), 'utf8'))
  const portrait = Buffer.from(original.assets.find(a => a.id === 'maid-left').src.split(',')[1], 'base64')
  const { w, h } = result.canvas
  const sourceAlpha = await sharp(portrait).resize(w, h, { fit: 'contain', background: '#00000000' }).ensureAlpha().raw().toBuffer()
  const rendered = await sharp(Buffer.from(result.images.base.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer()
  let covered = 0, expected = 0
  for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
    if (sourceAlpha[(y * w + x) * 4 + 3] < 200) continue
    expected++; let found = false
    for (let dy = -3; dy <= 3 && !found; dy++) for (let dx = -3; dx <= 3; dx++) if (rendered[((y + dy) * w + x + dx) * 4 + 3] > 64) { found = true; break }
    if (found) covered++
  }
  result.metrics.silhouetteCoverage = covered / expected
  let renderedPixels = 0
  for (let i = 3; i < rendered.length; i += 4) if (rendered[i] > 64) renderedPixels++
  result.metrics.foregroundRatio = renderedPixels / expected
  const tiles = []
  for (const [i, [name, data]] of Object.entries(result.images).entries()) {
    const png = Buffer.from(data.split(',')[1], 'base64')
    await writeFile(resolve(evidence, name + '.png'), png)
    tiles.push({ input: await sharp(png).resize(384, 384).flatten({ background: '#f1edf6' }).png().toBuffer(), left: (i % 4) * 384, top: Math.floor(i / 4) * 384 })
  }
  await sharp({ create: { width: 1536, height: 768, channels: 4, background: '#f1edf6' } }).composite(tiles).png().toFile(resolve(evidence, 'contact.png'))
  const faceTiles = [], face = result.anchors.face
  const crop = { left: Math.max(0, Math.floor(face.x0 - 35)), top: Math.max(0, Math.floor(face.y0 - 35)), width: Math.ceil(face.x1 - face.x0 + 70), height: Math.ceil(face.y1 - face.y0 + 70) }
  crop.width = Math.min(crop.width, w - crop.left); crop.height = Math.min(crop.height, h - crop.top)
  for (const [i, name] of ['base', 'left', 'right', 'open', 'blink', 'tilt'].entries()) faceTiles.push({ input: await sharp(Buffer.from(result.images[name].split(',')[1], 'base64')).extract(crop).resize(384, 384, { fit: 'contain', background: '#f1edf6' }).flatten({ background: '#f1edf6' }).png().toBuffer(), left: (i % 3) * 384, top: Math.floor(i / 3) * 384 })
  await sharp({ create: { width: 1152, height: 768, channels: 4, background: '#f1edf6' } }).composite(faceTiles).png().toFile(resolve(evidence, 'faces.png'))
  const { images, ...measurements } = result
  measurements.modelSha256 = createHash('sha256').update(bytes).digest('hex')
  await writeFile(resolve(evidence, 'measurements.json'), JSON.stringify(measurements, null, 2))
  console.log(JSON.stringify(result.metrics))
  assert.ok(result.layers.length >= 16, 'Many genuinely separate semantic parts')
  assert.ok(result.anchors.eyeL && result.anchors.eyeR, 'Independent eye anchors')
  assert.ok(result.metrics.eyeFace > .1, 'Iris pixels respond to gaze')
  assert.ok(result.metrics.eyeBody < .001, 'Eye movement leaves body untouched')
  assert.ok(result.metrics.mouthFace > .1, 'Independent mouth movement')
  assert.ok(result.metrics.blinkFace > .1, 'Independent eyelids')
  assert.ok(result.metrics.faceLayer > 1, 'Face is an actual separate RGBA layer')
  assert.ok(result.metrics.tailLayer > .1, 'Tail is an actual separate RGBA layer')
  assert.ok(result.metrics.reduced < .001, 'Reduced motion stops hair wind as well')
  assert.ok(result.metrics.silhouetteCoverage >= .95, 'Reject missing clothing/body regions; see work/decomposed-avatar/contact.png')
  assert.ok(result.metrics.foregroundRatio <= 1.15, 'Reject opaque backgrounds and excessive extra foreground')
  // Verify the actual shipped card and ordinary user flow after pixel QA.
  await page.getByTitle('桌宠选项', { exact: true }).click(); await page.getByTitle('角色工坊', { exact: true }).click()
  if (process.env.DEBBY_DECOMPOSED_PSD) await page.getByLabel('导入角色 PSD', { exact: true }).setInputFiles(input)
  else await page.getByRole('button', { name: '遇见鲸鱼娘', exact: false }).click()
  await page.waitForSelector('.avatar-preview [data-engine=anime25d][data-layered-ready=true]', { timeout: 30000 })
  await page.getByRole('button', { name: '试试口型', exact: true }).click()
  await page.waitForFunction(() => Number(document.querySelector('.avatar-preview .layered-pet-host').dataset.mouth) > .3)
  await page.getByRole('button', { name: '停止试口型', exact: true }).click()
  await page.screenshot({ path: resolve(evidence, 'studio.png') })
  await page.getByRole('button', { name: '用这个角色陪我', exact: true }).click()
  await page.getByTitle('关闭角色工坊').click()
  await page.reload(); await page.waitForSelector('.pet-wrap [data-engine=anime25d][data-layered-ready=true]', { timeout: 30000 })
  await page.evaluate(() => window.finpet.enableShell(true))
  harness = new DebbyClient(resolve(userData, 'agent-bridge.json'), 'Decomposed whale QA')
  await harness.setTask('parts-qa', '陪你看懂行情', 'working')
  await harness.say('parts-qa', 'parts-caring', '辛苦啦，先陪你歇一会儿。', { expression: { emotion: 'caring', intensity: .8 } })
  await page.waitForSelector('.pet-wrap [data-emotion=caring][data-emotion-source=agent]')
  await harness.animate('parts-qa', 'nod')
  await page.waitForSelector('.pet-wrap [data-behavior=nod]')
  await page.evaluate(() => window.finpet.cancelShellTask())
  await harness.release(); harness = undefined
  await page.evaluate(() => window.finpet.controlDance({ action: 'play', id: 'welcome' }))
  await page.waitForSelector('.pet-wrap [data-3d-ready=true]', { timeout: 30000 })
  await page.evaluate(() => window.finpet.controlDance({ action: 'stop' }))
  await page.waitForSelector('.pet-wrap [data-engine=anime25d][data-layered-ready=true]', { timeout: 30000 })
  assert.equal((await page.evaluate(() => window.finpet.getVoiceState())).active, false)
  assert.deepEqual(await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { visible: w.isVisible(), focused: w.isFocused(), muted: w.webContents.isAudioMuted() } }), { visible: false, focused: false, muted: true })
  assert.deepEqual(errors, [])
  console.log('Decomposed avatar: real PSD/parts, masked irises, independent mouth/blink, isolated body, reduced motion; no focus/audio/devices.')
} finally { await harness?.release().catch(() => {}); await app?.close(); await rm(userData, { recursive: true, force: true }) }
