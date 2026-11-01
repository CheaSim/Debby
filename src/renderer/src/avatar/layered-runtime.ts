import { layeredAvatarLimits, type LayeredAvatarDriver, type LayeredAvatarSurface, type LayeredRig, type LayeredSurfaceOptions } from '../../../shared/layered-avatar'
import { isStandRig } from '../../../shared/standrig-avatar'
import { isExpressionRig, portableExpressionBundle, type ExpressionAvatarRig } from '../../../shared/expression-avatar'

const assetUrl = (name: string): URL => new URL(`vendor/anime25d/${name}`, document.baseURI)
interface RigGlobals { DebbyRig: { create(gl: WebGLRenderingContext, rig: LayeredRig): LayeredAvatarDriver } }
let engineLoading: Promise<void> | undefined
export async function createLayeredDriver(gl: WebGLRenderingContext, rig: LayeredRig): Promise<LayeredAvatarDriver> {
  engineLoading ??= (async () => {
    for (const name of ['runtime.js', 'rigger.js', 'renderer.js', 'debby-rig.js']) await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script'); script.src = assetUrl(name).href
      script.onload = () => resolve(); script.onerror = () => { script.remove(); reject(Error('角色渲染组件加载失败，请重新打开角色工坊。')) }
      document.head.append(script)
    })
  })().catch(e => { engineLoading = undefined; throw e })
  await engineLoading
  if (gl.isContextLost()) throw Error('角色画布已关闭。')
  return (window as unknown as RigGlobals).DebbyRig.create(gl, rig)
}
export async function createLayeredSurface(canvas: HTMLCanvasElement, rig: LayeredRig, options: LayeredSurfaceOptions = {}): Promise<LayeredAvatarSurface> {
  if (isExpressionRig(rig)) return (await import('./expression-runtime')).createExpressionSurface(canvas, rig, options)
  if (isStandRig(rig)) return (await import('./standrig-runtime')).createStandRigSurface(rig, canvas)
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true })
  if (!gl) throw Error('这台设备无法创建透明角色画布。')
  canvas.width = rig.canvas.w; canvas.height = rig.canvas.h
  let driver: LayeredAvatarDriver
  try { driver = await createLayeredDriver(gl, rig) }
  catch (e) { gl.getExtension('WEBGL_lose_context')?.loseContext(); throw e }
  return { canvas, frame: (...args) => driver.frame(...args),
    visible() {
      const pixel = new Uint8Array(canvas.width * canvas.height * 4)
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
      return pixel.some((n, i) => i % 4 === 3 && n > 10)
    },
    dispose() { driver.dispose(); gl.getExtension('WEBGL_lose_context')?.loseContext() }
  }
}
/** Replaceable authoring backend: PSD bytes in, renderer-independent rig out. */
export interface LayeredAvatarBackend {
  parse(file: Blob, options: { signal: AbortSignal; progress?: (text: string) => void }): Promise<LayeredRig>
}
export class PortableAvatarBackend implements LayeredAvatarBackend {
  private psd = new Anime25DBackend()
  async parse(file: Blob, options: { signal: AbortSignal; progress?: (text: string) => void }): Promise<LayeredRig> {
    if (!file.size || file.size > layeredAvatarLimits.bytes) throw Error('请选择 64 MB 以内的角色文件。')
    options.signal.throwIfAborted()
    const header = await file.slice(0, 128).text(); options.signal.throwIfAborted()
    if (!header.trimStart().startsWith('{')) return this.psd.parse(file, options)
    const document = JSON.parse(await file.text()); options.signal.throwIfAborted()
    if (document?.format === 'debby-expression-bundle') {
      const bundle = portableExpressionBundle(document), poses: ExpressionAvatarRig['expressionSet']['poses'] = []
      for (const [index, pose] of bundle.poses.entries()) {
        options.signal.throwIfAborted(); options.progress?.(`正在绑定 ${pose.label}（${index + 1}/${bundle.poses.length}）…`)
        const bytes = Uint8Array.from(atob(pose.psd), c => c.charCodeAt(0))
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
        options.signal.throwIfAborted()
        if ([...digest].map(n => n.toString(16).padStart(2, '0')).join('') !== pose.sha256) throw Error(`${pose.label} 的 PSD 校验失败，请重新导出。`)
        const rig = await this.psd.parse(new Blob([bytes]), { signal: options.signal })
        poses.push({ id: pose.id, label: pose.label, eyes: pose.eyes, mouthRest: pose.mouthRest, freeArm: pose.freeArm, rig })
      }
      const neutral = poses.find(pose => pose.id === bundle.defaultPose)!.rig
      return { ...neutral, engine: 'anime25d-expressions', expressionSet: { name: bundle.name, defaultPose: bundle.defaultPose, expressions: bundle.expressions, behaviors: bundle.behaviors, poses } } as ExpressionAvatarRig
    }
    options.progress?.('正在校验 StandRig 模型…')
    const bytes = await file.arrayBuffer(); options.signal.throwIfAborted()
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./standrig-worker.ts', import.meta.url), { type: 'module' })
      const finish = (error?: Error, rig?: LayeredRig): void => {
        clearTimeout(timeout); options.signal.removeEventListener('abort', abort); worker.terminate()
        if (error) reject(error); else resolve(rig!)
      }
      const abort = (): void => finish(new DOMException('已取消导入。', 'AbortError'))
      const timeout = setTimeout(() => finish(Error('模型校验超时，请精简部件后重试。')), layeredAvatarLimits.timeout)
      options.signal.addEventListener('abort', abort, { once: true })
      worker.onerror = () => finish(Error('StandRig 解析组件出错，请确认文件完整。'))
      worker.onmessage = ({ data }) => data.error ? finish(Error(data.error)) : finish(undefined, data.rig)
      worker.postMessage(bytes, [bytes])
    })
  }
}
export class Anime25DBackend implements LayeredAvatarBackend {
  async parse(file: Blob, { signal, progress }: { signal: AbortSignal; progress?: (text: string) => void }): Promise<LayeredRig> {
    if (!file.size || file.size > layeredAvatarLimits.bytes) throw Error('请选择 64 MB 以内的 RGB / 8 bit 分层 PSD。')
    signal.throwIfAborted()
    const bytes = await file.arrayBuffer(); signal.throwIfAborted()
    if (bytes.byteLength < 26) throw Error('PSD 文件不完整。')
    const header = new DataView(bytes)
    if (header.getUint32(0) !== 0x38425053 || header.getUint16(4) !== 1) throw Error('请选择有效的 PSD 文件，暂不支持 PSB。')
    if (header.getUint16(22) !== 8 || header.getUint16(24) !== 3) throw Error('请将 PSD 另存为 RGB / 8 bit 后重试。')
    return new Promise((resolve, reject) => {
      const worker = new Worker(assetUrl('debby-worker.js'))
      const finish = (error?: Error, rig?: LayeredRig): void => {
        clearTimeout(timeout); signal.removeEventListener('abort', abort); worker.terminate()
        if (error) reject(error); else resolve(rig!)
      }
      const abort = (): void => finish(new DOMException('已取消导入。', 'AbortError'))
      const timeout = setTimeout(() => finish(Error('解析超时，请精简图层或缩小 PSD 后重试。')), layeredAvatarLimits.timeout)
      signal.addEventListener('abort', abort, { once: true })
      worker.onerror = () => finish(Error('PSD 解析组件出错，请确认文件完整并重试。'))
      worker.onmessage = ({ data }: MessageEvent<{ progress?: string; error?: string; rig?: LayeredRig }>) => {
        if (data.error) finish(Error(data.error))
        else if (data.rig) finish(undefined, data.rig)
        else if (data.progress) progress?.(data.progress)
      }
      worker.postMessage(bytes, [bytes])
    })
  }
}
