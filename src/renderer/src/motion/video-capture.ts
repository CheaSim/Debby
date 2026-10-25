import { danceLimits, type DanceMotion } from '../../../shared/dance'
import { retargetVideo, type PosePoint, type PoseSample } from './pose-retarget'

export interface CaptureProgress { fraction: number; image: PosePoint[]; time: number }
export interface VideoMotionBackend {
  capture(video: HTMLVideoElement, options: { name: string; start: number; end: number; mirror: boolean; signal: AbortSignal; progress: (value: CaptureProgress) => void }): Promise<DanceMotion>
}
/** Local backend, replaceable by a GPU/remote/offline estimator through the same interface. */
export class MediaPipeVideoBackend implements VideoMotionBackend {
  async capture(video: HTMLVideoElement, options: Parameters<VideoMotionBackend['capture']>[1]): Promise<DanceMotion> {
    const { signal, start, end } = options
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > video.duration || end - start < .5 || end - start > danceLimits.videoSeconds) throw Error('请截取 0.5–60 秒的视频片段。')
    const base = new URL('mocap/', new URL(import.meta.env.BASE_URL, location.href)).href
    const worker = new Worker(new URL('pose.worker.js', base))
    let id = 0
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
    const stop = (): void => { worker.terminate(); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('已取消学习。')) }; pending.clear() }
    signal.addEventListener('abort', stop, { once: true })
    worker.onmessage = ({ data }) => { const p = pending.get(data.id); if (p) { clearTimeout(p.timer); pending.delete(data.id); if (data.error) p.reject(Error(data.error)); else p.resolve(data) } }
    worker.onerror = () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('本地视频识别异常，请重新选择视频。')) }; pending.clear() }
    const request = (data: object, transfers: Transferable[] = []): Promise<any> => new Promise((resolve, reject) => {
      if (signal.aborted) { reject(Error('已取消学习。')); return }
      const key = ++id
      pending.set(key, { resolve, reject, timer: setTimeout(() => { pending.delete(key); reject(Error('识别超时，请取消后重试。')) }, 45000) })
      worker.postMessage({ ...data, id: key }, transfers)
    })
    try {
      await request({ type: 'init', wasm: new URL('wasm/', base).href, model: new URL('pose_landmarker_full.task', base).href })
      const samples: PoseSample[] = [], count = Math.ceil((end - start) * 24)
      video.pause()
      for (let i = 0; i <= count; i++) {
        signal.throwIfAborted()
        const time = Math.min(i / 24, end - start - .001), target = start + time
        if (Math.abs(video.currentTime - target) > .0001 || video.readyState < 2) await seek(video, target, signal)
        const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight))
        const bitmap = await createImageBitmap(video, { resizeWidth: Math.max(1, Math.round(video.videoWidth * scale)), resizeHeight: Math.max(1, Math.round(video.videoHeight * scale)) })
        const result = await request({ type: 'frame', bitmap, timestamp: i / 24 * 1000 + 1 }, [bitmap])
        const world = (result.world as PosePoint[]).map(p => options.mirror ? { ...p, x: -p.x } : p)
        // Mirroring must also swap anatomical side labels to keep a right-handed rig.
        if (options.mirror) for (const [a, b] of [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]]) if (world[a] && world[b]) [world[a], world[b]] = [world[b], world[a]]
        // The last duration endpoint is represented once, even for an exact multiple of 24.
        if (!samples.length || time > samples.at(-1)!.time) samples.push({ time, world })
        options.progress({ fraction: (i + 1) / (count + 1), image: result.image, time: target })
      }
      signal.throwIfAborted()
      return retargetVideo(samples, options.name, end - start)
    } finally { signal.removeEventListener('abort', stop); stop() }
  }
}
function seek(video: HTMLVideoElement, time: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => { clearTimeout(timer); signal.removeEventListener('abort', abort); video.removeEventListener('seeked', done); video.removeEventListener('error', fail) }
    const done = (): void => { cleanup(); resolve() }
    const fail = (): void => { cleanup(); reject(Error('无法读取视频帧，请转换成常见的 MP4 / H.264 后重试。')) }
    const abort = (): void => { cleanup(); reject(Error('已取消学习。')) }
    const timer = setTimeout(fail, 8000)
    video.addEventListener('seeked', done, { once: true }); video.addEventListener('error', fail, { once: true }); signal.addEventListener('abort', abort, { once: true })
    video.currentTime = time
  })
}
