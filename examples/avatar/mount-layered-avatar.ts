import { Anime25DBackend, createLayeredDriver } from '../../src/renderer/src/avatar/layered-runtime'
import { layeredParameters, type LayeredFrameInput } from '../../src/shared/layered-avatar'

/** Browser host example. Serve public/vendor/anime25d/ alongside your page. No React/Electron required. */
export async function mountLayeredAvatar(canvas: HTMLCanvasElement, file: Blob, signal: AbortSignal) {
  const rig = await new Anime25DBackend().parse(file, { signal })
  signal.throwIfAborted()
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true })
  if (!gl) throw Error('WebGL is unavailable')
  canvas.width = rig.canvas.w; canvas.height = rig.canvas.h
  const driver = await createLayeredDriver(gl, rig)
  let frame = 0, disposed = false, previous = performance.now()
  let input: LayeredFrameInput = { time: 0, mood: 'idle', behavior: 'idle', mouth: 0, gaze: { x: 0, y: 0 } }
  const dispose = (): void => {
    if (disposed) return
    disposed = true; cancelAnimationFrame(frame); driver.dispose()
    gl.getExtension('WEBGL_lose_context')?.loseContext(); signal.removeEventListener('abort', dispose)
  }
  if (signal.aborted) { dispose(); signal.throwIfAborted() }
  const tick = (now: number): void => {
    if (disposed) return
    const dt = Math.min(.05, Math.max(0, (now - previous) / 1000)); previous = now
    input.time += dt
    driver.frame(layeredParameters(input), dt, input.time)
    frame = requestAnimationFrame(tick)
  }
  signal.addEventListener('abort', dispose, { once: true }); frame = requestAnimationFrame(tick)
  return { setInput(patch: Partial<Omit<LayeredFrameInput, 'time'>>) { input = { ...input, ...patch } }, dispose }
}
