import { expressionPose, type ExpressionAvatarRig } from '../../../shared/expression-avatar'
import type { LayeredAvatarDriver, LayeredAvatarSurface, LayeredRig, LayeredSurfaceOptions } from '../../../shared/layered-avatar'
import { createLayeredDriver } from './layered-runtime'

type Pose = ExpressionAvatarRig['expressionSet']['poses'][number]
// A single, fixed stage keeps the head and shoes in frame throughout a transition.
function stageFor(rig: ExpressionAvatarRig) {
  const { w, h } = rig.canvas
  const placements = new Map(rig.expressionSet.poses.map(pose => {
    const scale = Math.min(w / pose.rig.canvas.w, h / pose.rig.canvas.h)
    return [pose.id, { scale, x: (w - pose.rig.canvas.w * scale) / 2, y: h - pose.rig.canvas.h * scale }] as const
  }))
  const layers: LayeredRig['layers'] = [], faces: LayeredRig['anchors']['face'][] = []
  for (const pose of rig.expressionSet.poses) {
    const { scale, x, y } = placements.get(pose.id)!, face = pose.rig.anchors.face
    faces.push({ x0: x + face.x0 * scale, x1: x + face.x1 * scale, y0: y + face.y0 * scale, y1: y + face.y1 * scale })
    for (const layer of pose.rig.layers) {
      const bounds = [layer.x, layer.y, layer.w, layer.h].every(Number.isFinite) ? layer : { x: 0, y: 0, ...pose.rig.canvas }
      layers.push({ name: layer.name, z: layer.z, x: x + bounds.x! * scale, y: y + bounds.y! * scale, w: bounds.w! * scale, h: bounds.h! * scale })
    }
  }
  const view: LayeredRig = { ...rig, layers, anchors: { ...rig.anchors, face: { x0: Math.min(...faces.map(f => f.x0)), x1: Math.max(...faces.map(f => f.x1)), y0: Math.min(...faces.map(f => f.y0)), y1: Math.max(...faces.map(f => f.y1)) } } }
  return { placements, view }
}

/** One WebGL context / two texture sets; premultiplied image blending happens on a transparent stage. */
export async function createExpressionSurface(canvas: HTMLCanvasElement, rig: ExpressionAvatarRig, options: LayeredSurfaceOptions = {}): Promise<LayeredAvatarSurface> {
  const source = document.createElement('canvas'), outgoing = document.createElement('canvas')
  const context = canvas.getContext('2d', { alpha: true }), old = outgoing.getContext('2d', { alpha: true })
  const gl = source.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true })
  if (!context || !old || !gl) throw Error('这台设备无法创建透明角色画布。')
  const duration = Number.isFinite(options.expressionTransitionMs) ? Math.max(0, Math.min(600, options.expressionTransitionMs!)) / 1000 : .22
  const stage = stageFor(rig)
  canvas.width = outgoing.width = rig.canvas.w; canvas.height = outgoing.height = rig.canvas.h
  let active = expressionPose(rig), disposed = false, requested = active.id, pending = false, hasFrame = false
  let from: Pose | undefined, transitioning = false, startedAt = 0, blend = 1
  const cache = new Map<string, LayeredAvatarDriver>(), failed = new Set<string>()
  try { cache.set(active.id, await createLayeredDriver(gl, active.rig)) }
  catch (error) { gl.getExtension('WEBGL_lose_context')?.loseContext(); throw error }
  const lost = (event: Event): void => {
    event.preventDefault()
    if (!disposed) canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
  }
  source.addEventListener('webglcontextlost', lost)
  const capture = (): void => {
    old.globalCompositeOperation = 'copy'; old.drawImage(canvas, 0, 0); old.globalCompositeOperation = 'source-over'
  }
  return {
    canvas, viewRig: () => stage.view,
    frame(params, dt, time, expression, contextInput) {
      if (disposed) return
      if (gl.isContextLost()) throw Error('图形上下文已丢失。')
      const marketFace = params.mouthForm > .4 ? 'happy' : params.mouthForm < -.1 ? 'caring' : undefined
      const fallback = !expression?.intensity && !rig.expressionSet.behaviors?.[contextInput?.behavior ?? 'idle'] && marketFace ? { emotion: marketFace, intensity: .6 } as const : undefined
      const target = expressionPose(rig, expression?.intensity ? expression : fallback, contextInput?.behavior, contextInput?.pose)
      requested = target.id
      if (cache.has(target.id) && target.id !== active.id) {
        // Interruptions start with the exact displayed composite, never a discarded endpoint.
        from = transitioning ? undefined : active
        capture(); active = target; startedAt = time
        transitioning = hasFrame && duration > 0 && !contextInput?.reducedMotion
      } else if (!cache.has(target.id) && !pending && !failed.has(target.id)) {
        // Keep at most the active and incoming texture sets, even during rapid streamed cues.
        for (const [id, driver] of cache) if (id !== active.id) {
          if (from?.id === id) from = undefined // outgoing already holds its most recent live frame
          driver.dispose(); cache.delete(id)
        }
        pending = true
        void createLayeredDriver(gl, target.rig).then(driver => {
          pending = false
          if (disposed || requested !== target.id) { driver.dispose(); return }
          cache.set(target.id, driver)
        }).catch(() => {
          pending = false
          if (!disposed) { failed.add(target.id); canvas.dataset.expressionError = target.id }
        })
      }
      if (contextInput?.reducedMotion) transitioning = false
      const progress = transitioning ? Math.max(0, Math.min(1, (time - startedAt) / duration)) : 1
      blend = progress * progress * progress * (10 + progress * (-15 + 6 * progress))
      if (progress >= 1) { transitioning = false; from = undefined }
      const render = (pose: Pose): void => {
        if (source.width !== pose.rig.canvas.w) source.width = pose.rig.canvas.w
        if (source.height !== pose.rig.canvas.h) source.height = pose.rig.canvas.h
        const rest = pose.mouthRest ?? 0, voice = Math.max(0, Math.min(1, params.mouthOpen ?? 0))
        const values = { ...params, mouthOpen: rest + (1 - rest) * voice, ...(pose.eyes === 'closed' ? { eyeOpenL: 0, eyeOpenR: 0 } : {}) }
        // A hand holding the skirt stays attached; only the authored free hand waves.
        if (pose.freeArm) Object.assign(values, {
          armL: pose.freeArm === 'left' ? params.armR : 0, armR: pose.freeArm === 'right' ? params.armR : 0,
          armYL: pose.freeArm === 'left' ? params.armY : 0, armYR: pose.freeArm === 'right' ? params.armY : 0
        })
        cache.get(pose.id)!.frame(values, dt, time, expression, contextInput)
      }
      const draw = (ctx: CanvasRenderingContext2D, pose: Pose): void => {
        const { scale, x, y } = stage.placements.get(pose.id)!
        ctx.drawImage(source, x, y, pose.rig.canvas.w * scale, pose.rig.canvas.h * scale)
      }
      if (transitioning && from && cache.has(from.id)) {
        render(from); old.clearRect(0, 0, outgoing.width, outgoing.height); draw(old, from)
      }
      render(active)
      context.clearRect(0, 0, canvas.width, canvas.height)
      if (transitioning) {
        context.globalAlpha = 1 - blend; context.drawImage(outgoing, 0, 0)
        // Weighted addition preserves opaque overlap; source-over would dim it to 75% at halfway.
        context.globalCompositeOperation = 'lighter'; context.globalAlpha = blend; draw(context, active)
      } else draw(context, active)
      context.globalAlpha = 1; context.globalCompositeOperation = 'source-over'; hasFrame = true
      canvas.dataset.expressionPose = source.dataset.expressionPose = active.id
      canvas.dataset.expressionLabel = active.label
      canvas.dataset.expressionTextures = String(cache.size)
      canvas.dataset.expressionTransitioning = String(transitioning)
      canvas.dataset.expressionBlend = blend.toFixed(4)
    },
    visible() { return context.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 10) },
    dispose() {
      if (disposed) return
      disposed = true; for (const driver of cache.values()) driver.dispose()
      cache.clear(); source.removeEventListener('webglcontextlost', lost); gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.width = canvas.height = outgoing.width = outgoing.height = source.width = source.height = 1
    }
  }
}
