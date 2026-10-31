import { PortableAvatarBackend, createLayeredSurface } from '../../src/renderer/src/avatar/layered-runtime'
import { applyLayeredPerformance, layeredParameters, type LayeredFrameInput } from '../../src/shared/layered-avatar'
import type { ExpressionDirective } from '../../src/shared/avatar-performance'

/** Vite/browser host: PSD or srig. Serve public/vendor/anime25d/ for PSD. No React/Electron required. */
export async function mountLayeredAvatar(canvas: HTMLCanvasElement, file: Blob, signal: AbortSignal) {
  const rig = await new PortableAvatarBackend().parse(file, { signal })
  signal.throwIfAborted()
  const driver = await createLayeredSurface(canvas, rig)
  let frame = 0, disposed = false, previous = performance.now()
  let input: LayeredFrameInput = { time: 0, mood: 'idle', behavior: 'idle', mouth: 0, gaze: { x: 0, y: 0 } }
  let expression: ExpressionDirective | undefined
  const dispose = (): void => {
    if (disposed) return
    disposed = true; cancelAnimationFrame(frame); driver.dispose()
    signal.removeEventListener('abort', dispose)
  }
  if (signal.aborted) { dispose(); signal.throwIfAborted() }
  const tick = (now: number): void => {
    if (disposed) return
    const dt = Math.min(.05, Math.max(0, (now - previous) / 1000)); previous = now
    input.time += dt
    driver.frame(applyLayeredPerformance(layeredParameters(input), expression), dt, input.time, expression)
    frame = requestAnimationFrame(tick)
  }
  signal.addEventListener('abort', dispose, { once: true }); frame = requestAnimationFrame(tick)
  return { setInput(patch: Partial<Omit<LayeredFrameInput, 'time'>>) { input = { ...input, ...patch } }, setExpression(next?: ExpressionDirective) { expression = next }, dispose }
}
