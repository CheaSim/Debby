import { layeredAvatarLimits, type LayeredAvatarDriver, type LayeredRig } from '../../../shared/layered-avatar'

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
/** Replaceable authoring backend: PSD bytes in, renderer-independent rig out. */
export interface LayeredAvatarBackend {
  parse(file: Blob, options: { signal: AbortSignal; progress?: (text: string) => void }): Promise<LayeredRig>
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
