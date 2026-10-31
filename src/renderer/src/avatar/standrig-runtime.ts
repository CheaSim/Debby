import { FacialController, RigRuntime, parameterDefinitionsForRig } from './vendor/standrig/standrig.js'
import { isPortraitRig, standRigParameters, type StandRigAvatarRig } from '../../../shared/standrig-avatar'
import type { LayeredAvatarSurface } from '../../../shared/layered-avatar'

/** Host owns the clock, speech, devices and controller lease; StandRig only renders. */
export async function createStandRigSurface(rig: StandRigAvatarRig, canvas: HTMLCanvasElement): Promise<LayeredAvatarSurface> {
  const model = rig.document
  const runtime = new RigRuntime(model, { cacheEvaluation: true }), facial = new FacialController(model)
  const definitions = parameterDefinitionsForRig(model), defaults = Object.fromEntries(definitions.map(p => [p.id, p.default]))
  const expressions = new Set(model.facialPresets?.expressions.map(p => p.id) ?? [])
  const portraits = isPortraitRig(rig)
  let lastExpression = '', disposed = false
  try { await runtime.loadAssets() } catch (e) { runtime.dispose(); throw e }
  return {
    canvas,
    frame(params, _dt, _time, expression) {
      if (disposed) return
      const fallback = params.mouthForm < -.1 ? 'caring' : params.mouthForm > .4 ? 'happy' : params.brow > .1 ? 'curious' : 'neutral'
      const emotion = expression && expression.intensity > 0 ? expression.emotion : portraits ? fallback : ''
      const now = performance.now(), id = expressions.has(emotion) ? emotion : ''
      // Whole-pose illustrations switch discretely; fractional overlays would ghost two bodies.
      const strength = portraits ? 1 : expression?.intensity ?? 0
      const signature = `${id}:${strength}`
      if (signature !== lastExpression) {
        if (id) facial.command({ action: 'expression', id, strength }, now)
        else facial.command({ action: 'clear', layer: 'expression' }, now)
        lastExpression = signature
      }
      const mapped = standRigParameters(params, definitions), values = facial.evaluate({ ...defaults, ...mapped }, now)
      // Mouth amplitude comes from Debby's real speech clock, independent of expression presets.
      for (const key of ['ParamMouthOpen', 'ParamMouthOpenY']) if (key in mapped) values[key] = mapped[key]
      runtime.render(canvas, values, { transparent: true, fitPadding: 0 })
      canvas.dataset.standrigExpression = id
    },
    visible() {
      const sample = document.createElement('canvas'); sample.width = sample.height = 64
      const context = sample.getContext('2d')!; context.drawImage(canvas, 0, 0, 64, 64)
      return context.getImageData(0, 0, 64, 64).data.some((n, i) => i % 4 === 3 && n > 10)
    },
    dispose() { if (!disposed) { disposed = true; runtime.dispose(); canvas.width = canvas.height = 1 } }
  }
}
