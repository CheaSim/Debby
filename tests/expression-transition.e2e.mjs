import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { _electron as electron } from 'playwright'
import { createRequire } from 'node:module'
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const root = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url)
const evidence = resolve(root, 'work/expression-transition'), userData = await mkdtemp(resolve(tmpdir(), 'debby-transition-'))
await mkdir(evidence, { recursive: true })
let app
try {
  const sdk = await build({ stdin: { contents: `export { PortableAvatarBackend, createLayeredSurface } from './src/renderer/src/avatar/layered-runtime'; export { layeredParameters } from './src/shared/layered-avatar'`, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'iife', globalName: 'TransitionSdk', platform: 'browser', logLevel: 'silent' })
  app = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env: { ...process.env, FINPET_E2E_USER_DATA: userData, FINPET_E2E_BACKGROUND: '1', FINPET_MARKET_SOURCE: 'demo' } })
  const page = await app.firstWindow(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForSelector('[data-3d-ready=true]', { timeout: 30000 })
  await page.evaluate(sdk.outputFiles[0].text + ';globalThis.TransitionSdk = TransitionSdk')
  const result = await page.evaluate(async json => {
    const sdk = globalThis.TransitionSdk
    const rig = await new sdk.PortableAvatarBackend().parse(new Blob([json]), { signal: new AbortController().signal })
    const canvas = document.createElement('canvas'), driver = await sdk.createLayeredSurface(canvas, rig)
    const context = canvas.getContext('2d'), view = driver.viewRig(), snapshots = {}
    const params = { ...sdk.layeredParameters({ time: 1, mood: 'idle', behavior: 'idle', mouth: 0, gaze: { x: 0, y: 0 }, reducedMotion: true }), physAmp: 0, fhAmp: 0, accAmp: 0, bust: 0 }
    const pixels = () => context.getImageData(0, 0, canvas.width, canvas.height).data
    const step = (pose, time, reducedMotion = false, mouth = 0) => {
      driver.frame({ ...params, mouthOpen: mouth }, 0, time, undefined, { behavior: 'idle', reducedMotion, pose })
      if (driver.viewRig() !== view) throw Error('Expression switch moved the camera')
      if (Number(canvas.dataset.expressionTextures) > 2) throw Error('Unbounded texture cache')
    }
    const settle = async (pose, time, reduced = false) => {
      for (let attempt = 0; attempt < 50; attempt++) {
        step(pose, time, reduced)
        if (canvas.dataset.expressionPose === pose) return
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      throw Error('Pose did not load: ' + pose)
    }
    const difference = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length
    try {
      step('neutral', 0)
      const a = pixels(); snapshots.before = canvas.toDataURL()
      await settle('serious', 1)
      const startError = difference(a, pixels())
      step('serious', 1.11)
      const halfway = pixels(), halfwayBlend = Number(canvas.dataset.expressionBlend)
      snapshots.halfway = canvas.toDataURL()
      step('serious', 1.23)
      const b = pixels(); snapshots.after = canvas.toDataURL()
      let alphaError = 0, colorError = 0, colorSamples = 0, opaqueSamples = 0, dimmedOpaque = 0
      for (let i = 0; i < halfway.length; i += 4) {
        const alpha = (a[i + 3] + b[i + 3]) / 2
        alphaError += Math.abs(halfway[i + 3] - alpha)
        if (a[i + 3] > 250 && b[i + 3] > 250) { opaqueSamples++; if (halfway[i + 3] < 249) dimmedOpaque++ }
        if (alpha > 32) for (let c = 0; c < 3; c++) {
          const expected = (a[i + c] * a[i + 3] + b[i + c] * b[i + 3]) / (a[i + 3] + b[i + 3])
          colorError += Math.abs(halfway[i + c] - expected); colorSamples++
        }
      }
      alphaError /= halfway.length / 4; colorError /= colorSamples
      const endpointDifference = difference(a, b), completed = canvas.dataset.expressionTransitioning === 'false'
      // Reverse a live blend, then interrupt it with a third, initially uncached illustration.
      await settle('neutral', 2)
      step('neutral', 2.11)
      const interrupted = pixels()
      await settle('shy', 2.11)
      const interruptionError = difference(interrupted, pixels())
      step('shy', 2.22)
      const reversed = pixels()
      await settle('neutral', 2.22)
      const reversalError = difference(reversed, pixels())
      step('neutral', 2.33)
      const silent = pixels()
      step('neutral', 2.33, false, .9)
      const mouthDifference = difference(silent, pixels())
      // Stream several cues before texture upload resolves; only the latest cue should win.
      step('frightened', 3); step('cheerful', 3); step('starry', 3)
      await settle('starry', 3)
      const latestPose = canvas.dataset.expressionPose
      step('starry', 3.04, true)
      const reducedInstant = canvas.dataset.expressionTransitioning === 'false' && Number(canvas.dataset.expressionBlend) === 1
      const transparentCorner = pixels()[3]
      // Incoming work must be harmless after disposal.
      step('exasperated', 4); driver.dispose()
      await new Promise(resolve => setTimeout(resolve, 0))
      const instantCanvas = document.createElement('canvas')
      const instant = await sdk.createLayeredSurface(instantCanvas, rig, { expressionTransitionMs: 0 })
      instant.frame(params, 0, 0)
      for (let i = 0; i < 50 && instantCanvas.dataset.expressionPose !== 'shy'; i++) {
        instant.frame(params, 0, 1, undefined, { behavior: 'idle', reducedMotion: false, pose: 'shy' })
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      const disabledInstant = instantCanvas.dataset.expressionPose === 'shy' && instantCanvas.dataset.expressionTransitioning === 'false'
      instant.dispose()
      return { startError, halfwayBlend, alphaError, colorError, opaqueSamples, dimmedOpaque, endpointDifference, completed, interruptionError, reversalError, mouthDifference, latestPose, reducedInstant, disabledInstant, transparentCorner, snapshots }
    } finally { driver.dispose() }
  }, await readFile(resolve(root, 'src/renderer/public/models/whale-girl/debby-whale-girl.debby'), 'utf8'))
  for (const [name, png] of Object.entries(result.snapshots)) await writeFile(resolve(evidence, name + '.png'), Buffer.from(png.split(',')[1], 'base64'))
  delete result.snapshots
  console.log('Expression transition measurements:', JSON.stringify(result))
  assert.ok(result.startError < .01, 'Transition starts with the displayed outgoing image')
  assert.equal(result.halfwayBlend, .5)
  assert.ok(result.alphaError < .6 && result.colorError < 1.5, 'Actual pixels follow premultiplied blending')
  assert.ok(result.opaqueSamples > 10000 && result.dimmedOpaque === 0, 'Opaque overlapping artwork stays opaque')
  assert.ok(result.endpointDifference > 3 && result.completed)
  assert.ok(result.interruptionError < .01 && result.reversalError < .01, 'Rapid changes continue from the visible composite')
  assert.ok(result.mouthDifference > .001, 'Live mouth input continues during a transition')
  assert.equal(result.latestPose, 'starry')
  assert.ok(result.reducedInstant && result.disabledInstant)
  assert.equal(result.transparentCorner, 0)
  assert.deepEqual(errors, [])
  assert.deepEqual(await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; return { visible: w.isVisible(), focused: w.isFocused(), muted: w.webContents.isAudioMuted() } }), { visible: false, focused: false, muted: true })
  console.log('Expression transition E2E passed:', JSON.stringify(result))
} finally { await app?.close(); await rm(userData, { recursive: true, force: true }) }
