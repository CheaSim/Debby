import { expressionPose, type ExpressionAvatarRig } from '../../../shared/expression-avatar'
import type { LayeredAvatarDriver, LayeredAvatarSurface } from '../../../shared/layered-avatar'
import { createLayeredDriver } from './layered-runtime'

/** One WebGL context, at most two texture sets. Changing art preserves the host clock and lip sync. */
export async function createExpressionSurface(canvas: HTMLCanvasElement, rig: ExpressionAvatarRig): Promise<LayeredAvatarSurface> {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true })
  if (!gl) throw Error('这台设备无法创建透明角色画布。')
  let active = expressionPose(rig), disposed = false, requested = active.id
  const cache = new Map<string, LayeredAvatarDriver>(), pending = new Set<string>(), failed = new Set<string>()
  try { cache.set(active.id, await createLayeredDriver(gl, active.rig)) }
  catch (error) { gl.getExtension('WEBGL_lose_context')?.loseContext(); throw error }
  return {
    canvas, viewRig: () => active.rig,
    frame(params, dt, time, expression, context) {
      if (disposed) return
      const marketFace = params.mouthForm > .4 ? 'happy' : params.mouthForm < -.1 ? 'caring' : undefined
      const fallback = !expression?.intensity && !rig.expressionSet.behaviors?.[context?.behavior ?? 'idle'] && marketFace ? { emotion: marketFace, intensity: .6 } as const : undefined
      const target = expressionPose(rig, expression?.intensity ? expression : fallback, context?.behavior, context?.pose)
      requested = target.id
      if (cache.has(target.id)) active = target
      else if (!pending.has(target.id) && !failed.has(target.id)) {
        pending.add(target.id)
        void createLayeredDriver(gl, target.rig).then(driver => {
          pending.delete(target.id)
          if (disposed || requested !== target.id) { driver.dispose(); return }
          cache.set(target.id, driver)
          for (const [id, old] of cache) if (cache.size > 2 && id !== active.id && id !== requested) { old.dispose(); cache.delete(id) }
        }).catch(() => { pending.delete(target.id); failed.add(target.id); canvas.dataset.expressionError = target.id })
      }
      if (canvas.width !== active.rig.canvas.w) canvas.width = active.rig.canvas.w
      if (canvas.height !== active.rig.canvas.h) canvas.height = active.rig.canvas.h
      const driver = cache.get(active.id)!
      const rest = active.mouthRest ?? 0, voice = Math.max(0, Math.min(1, params.mouthOpen ?? 0))
      const values = { ...params, mouthOpen: rest + (1 - rest) * voice, ...(active.eyes === 'closed' ? { eyeOpenL: 0, eyeOpenR: 0 } : {}) }
      // A hand holding the skirt stays attached; only the authored free hand waves.
      if (active.freeArm) Object.assign(values, {
        armL: active.freeArm === 'left' ? params.armR : 0, armR: active.freeArm === 'right' ? params.armR : 0,
        armYL: active.freeArm === 'left' ? params.armY : 0, armYR: active.freeArm === 'right' ? params.armY : 0
      })
      driver.frame(values, dt, time, expression, context)
      canvas.dataset.expressionPose = active.id
      canvas.dataset.expressionLabel = active.label
      canvas.dataset.expressionTextures = String(cache.size)
    },
    visible() {
      const pixels = new Uint8Array(canvas.width * canvas.height * 4)
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      return pixels.some((value, index) => index % 4 === 3 && value > 10)
    },
    dispose() {
      if (disposed) return
      disposed = true; for (const driver of cache.values()) driver.dispose()
      cache.clear(); gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }
}
