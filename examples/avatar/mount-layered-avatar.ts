import { PortableAvatarBackend, createLayeredSurface } from '../../src/renderer/src/avatar/layered-runtime'
import { applyLayeredPerformance, layeredParameters, type LayeredFrameInput } from '../../src/shared/layered-avatar'
import type { ExpressionDirective } from '../../src/shared/avatar-performance'

/** Vite/browser host: PSD, srig or multi-illustration .debby. Serve public/vendor/anime25d/ for PSD. No React/Electron required. */
export async function mountLayeredAvatar(canvas: HTMLCanvasElement, file: Blob, signal: AbortSignal) {
  const rig = await new PortableAvatarBackend().parse(file, { signal })
  signal.throwIfAborted()
  const driver = await createLayeredSurface(canvas, rig)
  let frame = 0, disposed = false, previous = performance.now()
  let input: LayeredFrameInput = { time: 0, mood: 'idle', behavior: 'idle', mouth: 0, gaze: { x: 0, y: 0 } }
  let expression: ExpressionDirective | undefined
  let showSkeleton = false
  let pose: string | undefined
  const dispose = (): void => {
    if (disposed) return
    disposed = true; cancelAnimationFrame(frame); driver.dispose()
    signal.removeEventListener('abort', dispose)
  }
  if (signal.aborted) { dispose(); signal.throwIfAborted() }
  const tick = (now: number): void => {
    if (disposed) return
    const elapsed = Math.max(0, (now - previous) / 1000), dt = Math.min(.05, elapsed); previous = now
    input.time += elapsed
    driver.frame(applyLayeredPerformance(layeredParameters(input), expression, input.reducedMotion), dt, input.time, expression, { behavior: input.behavior, reducedMotion: Boolean(input.reducedMotion), showSkeleton, pose })
    frame = requestAnimationFrame(tick)
  }
  signal.addEventListener('abort', dispose, { once: true }); frame = requestAnimationFrame(tick)
  return { setInput(patch: Partial<Omit<LayeredFrameInput, 'time'>>) { input = { ...input, ...patch } }, setExpression(next?: ExpressionDirective) { expression = next }, setSkeletonPreview(show: boolean) { showSkeleton = show }, setPosePreview(id?: string) { pose = id }, dispose }
}
