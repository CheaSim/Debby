import type { LayeredRig } from './layered-avatar'

export interface StandRigParameter { id: string; min: number; max: number; default: number }
export interface PortraitEye { x: number; y: number; radiusX: number; radiusY: number }
export interface PortraitMotion {
  version: 1
  head: PortraitEye & { pivotX: number; pivotY: number }
  eyes: Record<string, PortraitEye[]>
}
export interface StandRigDocument {
  schemaVersion: string; name: string; stage: { width: number; height: number }
  assets: { id: string; src: string; width?: number; height?: number }[]
  parameters: StandRigParameter[]
  parts: { id: string; name: string; drawOrder: number; kind: string }[]
  facialPresets?: { expressions: { id: string }[] }
  metadata?: { debby?: { mode?: string; face?: { x0: number; x1: number; y0: number; y1: number }; motion?: PortraitMotion } }
  [key: string]: unknown
}
export interface StandRigAvatarRig extends LayeredRig { engine: 'standrig'; document: StandRigDocument }
export function isStandRig(rig: LayeredRig): rig is StandRigAvatarRig { return 'engine' in rig && rig.engine === 'standrig' }
export function isPortraitRig(rig: LayeredRig): boolean { return isStandRig(rig) && rig.document.metadata?.debby?.mode === 'portrait-poses' }

/** Local-only portable input. Inspect bounds before upstream validation or image decode. */
export function portableStandRig(value: unknown): StandRigDocument {
  let nodes = 0
  const visit = (v: unknown, depth: number): void => {
    if (++nodes > 200_000 || depth > 64) throw Error('模型结构过大，请精简部件后导出。')
    if (typeof v === 'number' && !Number.isFinite(v)) throw Error('模型包含无效数值。')
    if (v && typeof v === 'object') for (const [key, child] of Object.entries(v)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('模型包含无效字段。')
      visit(child, depth + 1)
    }
  }
  visit(value, 0)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('请选择 StandRig 导出的 .srig 文件。')
  const input = value as Record<string, unknown>
  const rig = (input.format === 'standrig-bundle' ? input.rig : input) as StandRigDocument
  if (!rig || typeof rig !== 'object' || rig.schemaVersion !== '0.1.0') throw Error('不支持此 StandRig 模型版本，请用兼容版本重新导出。')
  const { width: w, height: h } = rig.stage ?? {}
  if (![w, h].every(n => Number.isInteger(n) && n > 0 && n <= 4096) || w * h > 8_000_000) throw Error('模型画布过大，最大边长 4096，总计 800 万像素。')
  for (const [key, max] of [['parts', 512], ['assets', 256], ['parameters', 256], ['deformers', 512]] as const) {
    const list = rig[key]
    if (key === 'deformers' && list === undefined) continue
    if (!Array.isArray(list) || list.length > max) throw Error(`模型 ${key} 数量超出限制。`)
  }
  if (!rig.assets.length || !rig.parts.length) throw Error('模型没有可显示的部件。')
  const motion = rig.metadata?.debby?.motion
  if (motion !== undefined) {
    const validRegion = (eye: PortraitEye): boolean => Boolean(eye) && [eye.x, eye.y, eye.radiusX, eye.radiusY].every(Number.isFinite) && eye.x >= 0 && eye.x <= w && eye.y >= 0 && eye.y <= h && eye.radiusX > 0 && eye.radiusX <= w / 2 && eye.radiusY > 0 && eye.radiusY <= h / 2
    if (!motion || motion.version !== 1 || !validRegion(motion.head) || !Number.isFinite(motion.head.pivotX) || !Number.isFinite(motion.head.pivotY) || motion.head.pivotX < 0 || motion.head.pivotX > w || motion.head.pivotY < 0 || motion.head.pivotY > h || !motion.eyes || typeof motion.eyes !== 'object' || Array.isArray(motion.eyes) || Object.keys(motion.eyes).length > 32 || Object.values(motion.eyes).some(eyes => !Array.isArray(eyes) || eyes.length > 2 || !eyes.every(validRegion))) throw Error('立绘视线绑定无效，请检查头部和眼部锚点。')
  }
  let pixels = 0
  for (const asset of rig.assets) {
    if (!asset || typeof asset.src !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.src)) throw Error('请导出内嵌 PNG 贴图的 .srig；不读取外部网址或本机路径。')
    // Read the real PNG header, never trust optional JSON width/height metadata.
    const header = atob(asset.src.slice(22, 66))
    if (!header.startsWith('\x89PNG\r\n\x1a\n') || header.slice(12, 16) !== 'IHDR') throw Error('模型贴图不是有效 PNG。')
    const size = (offset: number): number => [...header.slice(offset, offset + 4)].reduce((n, c) => n * 256 + c.charCodeAt(0), 0)
    const aw = size(16), ah = size(20)
    pixels += aw * ah
    if (!aw || !ah || aw > 8192 || ah > 8192 || pixels > 32_000_000) throw Error('贴图解码尺寸过大，请缩小贴图后导出。')
  }
  return rig
}

/** Existing host motion contract -> standard authored StandRig parameters. */
export function standRigParameters(params: Record<string, number>, definitions: StandRigParameter[]): Record<string, number> {
  const target: Record<string, number> = {
    ParamAngleX: params.angleX * 30, ParamAngleY: params.angleY * 30, ParamAngleZ: params.angleZ * 30,
    ParamBodyAngleX: params.body * 30, ParamEyeBallX: params.eyeX, ParamEyeBallY: params.eyeY,
    ParamEyeLOpen: params.eyeOpenL, ParamEyeROpen: params.eyeOpenR,
    ParamMouthOpen: params.mouthOpen, ParamMouthOpenY: params.mouthOpen,
    ParamMouthForm: params.mouthForm, ParamMouthSmile: params.mouthForm,
    ParamBrowLY: params.brow, ParamBrowRY: params.brow,
    ParamBrowLAngle: params.browAngSym, ParamBrowRAngle: -params.browAngSym,
    ParamBreath: params.breath
  }
  return Object.fromEntries(definitions.filter(p => Number.isFinite(target[p.id])).map(p => [p.id, Math.max(p.min, Math.min(p.max, target[p.id]))]))
}
