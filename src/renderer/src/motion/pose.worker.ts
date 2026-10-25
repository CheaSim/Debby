import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

let detector: PoseLandmarker | undefined
self.onmessage = async (event: MessageEvent) => {
  const { id, type, wasm, model, bitmap, timestamp } = event.data
  try {
    if (type === 'init') {
      detector = await PoseLandmarker.createFromOptions(await FilesetResolver.forVisionTasks(wasm), {
        baseOptions: { modelAssetPath: model, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1,
        minPoseDetectionConfidence: .5, minPosePresenceConfidence: .5, minTrackingConfidence: .5, outputSegmentationMasks: false
      })
      self.postMessage({ id, ready: true })
    } else if (type === 'frame') {
      if (!detector) throw Error('识别器尚未准备好。')
      try {
        const result = detector.detectForVideo(bitmap, timestamp)
        self.postMessage({ id, world: result.worldLandmarks[0] ?? [], image: result.landmarks[0] ?? [] })
      } finally { bitmap.close() }
    }
  } catch { self.postMessage({ id, error: type === 'init' ? '本地识别器启动失败，请运行 npm run dance:setup 后重试。' : '这一帧无法识别，请换一个视频重试。' }) }
}
