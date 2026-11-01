import { FacialController, RigRuntime, parameterDefinitionsForRig, resolveRigFrame } from './vendor/standrig/standrig.js'
import { createSkeletonMotion } from '../../../shared/avatar-skeleton'
import { isPortraitRig, standRigParameters, type StandRigAvatarRig } from '../../../shared/standrig-avatar'
import type { LayeredAvatarSurface } from '../../../shared/layered-avatar'
import { createPortraitMotion } from './portrait-motion'

/** Host owns the clock, speech, devices and controller lease; StandRig only renders. */
export async function createStandRigSurface(rig: StandRigAvatarRig, canvas: HTMLCanvasElement): Promise<LayeredAvatarSurface> {
  const model = rig.document
  const runtime = new RigRuntime(model, { cacheEvaluation: true }), facial = new FacialController(model)
  const definitions = parameterDefinitionsForRig(model), defaults = Object.fromEntries(definitions.map(p => [p.id, p.default]))
  const expressions = new Set(model.facialPresets?.expressions.map(p => p.id) ?? [])
  const portraits = isPortraitRig(rig)
  const skeleton = model.metadata?.debby?.skeleton, dynamics = createSkeletonMotion()
  const binding = portraits && !skeleton ? model.metadata?.debby?.motion : undefined
  let motion: ReturnType<typeof createPortraitMotion> | undefined
  try { if (binding) motion = createPortraitMotion(rig.canvas.w, rig.canvas.h, binding) } catch { canvas.dataset.portraitMotion = 'unavailable' }
  const staticCanvas = motion ? document.createElement('canvas') : canvas
  const context = motion ? canvas.getContext('2d') : undefined
  let lastExpression = '', cachedExpression: string | undefined, disposed = false
  try { await runtime.loadAssets() } catch (e) { runtime.dispose(); motion?.dispose(); throw e }
  return {
    canvas,
    frame(params, dt, time, expression, frameContext) {
      if (disposed) return
      const fallback = params.mouthForm < -.1 ? 'caring' : params.mouthForm > .4 ? 'happy' : params.brow > .1 ? 'curious' : 'neutral'
      const behavior = frameContext?.behavior
      const gesture = behavior && (['greet', 'celebrate', 'clap'].includes(behavior) ? 'happy' : ['shy', 'heart', 'pat'].includes(behavior) ? 'shy' : ['think', 'working', 'waiting', 'listening'].includes(behavior) ? 'curious' : ['notify', 'lifted'].includes(behavior) ? 'surprised' : '')
      const emotion = expression && expression.intensity > 0 ? expression.emotion : portraits ? gesture || fallback : ''
      const now = performance.now(), id = expressions.has(emotion) ? emotion : ''
      // Whole-pose illustrations switch discretely; fractional overlays would ghost two bodies.
      const strength = portraits ? 1 : expression?.intensity ?? 0
      const signature = `${id}:${strength}`
      if (signature !== lastExpression) {
        if (id) facial.command({ action: 'expression', id, strength }, now)
        else facial.command({ action: 'clear', layer: 'expression' }, now)
        lastExpression = signature
      }
      const mapped = standRigParameters(params, definitions)
      if (skeleton) {
        Object.assign(mapped, dynamics.update(params, dt, time, frameContext?.reducedMotion))
        if (frameContext?.reducedMotion) for (const key of ['ParamAngleX', 'ParamAngleY', 'ParamAngleZ', 'ParamBodyAngleX', 'ParamEyeBallX', 'ParamEyeBallY', 'ParamBreath']) mapped[key] = 0
      }
      const values = facial.evaluate({ ...defaults, ...mapped }, now)
      // Mouth amplitude comes from Debby's real speech clock, independent of expression presets.
      for (const key of ['ParamMouthOpen', 'ParamMouthOpenY']) if (key in mapped) values[key] = mapped[key]
      if (motion && context && !frameContext?.reducedMotion) {
        if (cachedExpression !== id) {
          runtime.render(staticCanvas, { ...defaults, ...values, ParamBreath: 0 }, { transparent: true, fitPadding: 0 })
          motion.upload(staticCanvas); cachedExpression = id
        }
        motion.render(params, id)
        if (canvas.width !== rig.canvas.w || canvas.height !== rig.canvas.h) { canvas.width = rig.canvas.w; canvas.height = rig.canvas.h }
        context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(motion.canvas, 0, 0)
        canvas.dataset.portraitMotion = 'active'
      } else {
        runtime.render(canvas, values, { transparent: true, fitPadding: 0, webglWarp: Boolean(skeleton) })
        if (motion) canvas.dataset.portraitMotion = 'reduced'
      }
      canvas.dataset.skeletonJoints = String(skeleton?.jointIds.length ?? 0)
      if (skeleton) {
        canvas.dataset.portraitMotion = frameContext?.reducedMotion ? 'reduced' : 'skeleton'
        canvas.dataset.skeletonPose = `${mapped.DebbyHeadRoll.toFixed(3)}:${mapped.DebbyHairLeft.toFixed(3)}:${mapped.DebbyBodySway.toFixed(3)}`
        if (frameContext?.showSkeleton) {
          const context = canvas.getContext('2d')!, matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
          const frame = resolveRigFrame(model, values, matrix, { physics: false })
          const visible = new Set(skeleton.jointIds.filter(key => !key.includes('-eye-') || key.startsWith(id + '-eye-')))
          const points = new Map((model.deformers ?? []).filter(bone => visible.has(bone.id)).map(bone => {
            const m = frame.skinningTransforms.get(bone.id) ?? matrix, { x, y } = bone.origin
            return [bone.id, { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }]
          }))
          const scale = Math.min(canvas.width / rig.canvas.w, canvas.height / rig.canvas.h)
          context.save(); context.setTransform(scale, 0, 0, scale, (canvas.width - rig.canvas.w * scale) / 2, (canvas.height - rig.canvas.h * scale) / 2)
          context.strokeStyle = '#ff5c9e'; context.fillStyle = '#ffffff'; context.lineWidth = 3
          for (const bone of model.deformers ?? []) {
            const point = points.get(bone.id), parent = points.get(bone.parentId ?? '')
            if (!point) continue
            if (parent) { context.beginPath(); context.moveTo(parent.x, parent.y); context.lineTo(point.x, point.y); context.stroke() }
            context.beginPath(); context.arc(point.x, point.y, 5, 0, Math.PI * 2); context.fill(); context.stroke()
          }
          context.restore()
        }
      }
      canvas.dataset.standrigExpression = id
    },
    visible() {
      const sample = document.createElement('canvas'); sample.width = sample.height = 64
      const context = sample.getContext('2d')!; context.drawImage(canvas, 0, 0, 64, 64)
      return context.getImageData(0, 0, 64, 64).data.some((n, i) => i % 4 === 3 && n > 10)
    },
    dispose() { if (!disposed) { disposed = true; runtime.dispose(); motion?.dispose(); staticCanvas.width = staticCanvas.height = canvas.width = canvas.height = 1 } }
  }
}
