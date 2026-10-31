import { importStandRig } from './standrig-import'
self.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
  try { self.postMessage({ rig: importStandRig(JSON.parse(new TextDecoder().decode(data))) }) }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : '模型解析失败。' }) }
}
