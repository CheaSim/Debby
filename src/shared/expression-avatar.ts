import { avatarEmotions, type AvatarEmotion, type ExpressionDirective } from './avatar-performance'
import type { LayeredRig } from './layered-avatar'
import type { PetBehavior } from './pet-behavior'

export interface ExpressionPoseSource { id: string; label: string; psd: string; sha256: string; eyes?: 'closed'; mouthRest?: number; freeArm?: 'left' | 'right' }
/** Portable, offline character: one independently layered PSD for each illustration. */
export interface ExpressionAvatarDocument {
  format: 'debby-expression-bundle'; version: 1; name: string; defaultPose: string
  poses: ExpressionPoseSource[]; expressions: Partial<Record<AvatarEmotion, string>>
  behaviors?: Partial<Record<PetBehavior, string>>
}
export interface ExpressionAvatarRig extends LayeredRig {
  engine: 'anime25d-expressions'
  expressionSet: Omit<ExpressionAvatarDocument, 'format' | 'version' | 'poses'> & { poses: (Omit<ExpressionPoseSource, 'psd' | 'sha256'> & { rig: LayeredRig })[] }
}
export function isExpressionRig(rig: LayeredRig): rig is ExpressionAvatarRig { return 'engine' in rig && rig.engine === 'anime25d-expressions' }
export function expressionPose(rig: ExpressionAvatarRig, expression?: ExpressionDirective, behavior?: PetBehavior, override?: string): ExpressionAvatarRig['expressionSet']['poses'][number] {
  const set = rig.expressionSet
  const id = override || (expression && expression.intensity > 0 ? set.expressions[expression.emotion] : behavior && set.behaviors?.[behavior]) || set.defaultPose
  return set.poses.find(pose => pose.id === id) ?? set.poses.find(pose => pose.id === set.defaultPose)!
}
export function portableExpressionBundle(value: unknown): ExpressionAvatarDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('请选择 Debby 多表情角色包。')
  const doc = value as ExpressionAvatarDocument
  if (doc.format !== 'debby-expression-bundle' || doc.version !== 1 || typeof doc.name !== 'string' || !doc.name.trim() || doc.name.length > 80) throw Error('多表情角色包版本或名称无效。')
  if (!Array.isArray(doc.poses) || doc.poses.length < 2 || doc.poses.length > 12) throw Error('多表情角色包需要 2–12 张分层立绘。')
  let pixels = 0, bytes = 0
  const ids = new Set<string>()
  for (const pose of doc.poses) {
    if (!pose || typeof pose.id !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(pose.id) || ids.has(pose.id) || typeof pose.label !== 'string' || !pose.label.trim() || pose.label.length > 40 || (pose.eyes !== undefined && pose.eyes !== 'closed') || (pose.mouthRest !== undefined && (!Number.isFinite(pose.mouthRest) || pose.mouthRest < 0 || pose.mouthRest > .85))) throw Error('角色表情标识或名称无效。')
    ids.add(pose.id)
    if (pose.freeArm !== undefined && !['left', 'right'].includes(pose.freeArm)) throw Error('自由手臂绑定无效。')
    if (typeof pose.psd !== 'string' || pose.psd.length > 22_400_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(pose.psd) || pose.psd.length % 4 || !/^[a-f0-9]{64}$/.test(pose.sha256)) throw Error('表情必须使用内嵌 PSD 和 SHA-256，不读取外部网址。')
    const header = Uint8Array.from(atob(pose.psd.slice(0, 40)), c => c.charCodeAt(0)), view = new DataView(header.buffer)
    if (header.length < 26 || view.getUint32(0) !== 0x38425053 || view.getUint16(4) !== 1 || view.getUint16(22) !== 8 || view.getUint16(24) !== 3) throw Error('表情必须是 RGB / 8 bit PSD。')
    const h = view.getUint32(14), w = view.getUint32(18)
    pixels += w * h; bytes += pose.psd.length * .75
    if (!w || !h || w > 4096 || h > 4096 || w * h > 8_000_000 || pixels > 32_000_000 || bytes > 48 * 1024 * 1024) throw Error('多表情角色包解码尺寸过大。')
  }
  if (typeof doc.defaultPose !== 'string' || !ids.has(doc.defaultPose) || !doc.expressions || typeof doc.expressions !== 'object' || Array.isArray(doc.expressions) || doc.expressions.neutral !== doc.defaultPose || Object.keys(doc.expressions).some(key => !avatarEmotions.includes(key as AvatarEmotion)) || Object.values(doc.expressions).some(id => !ids.has(id))) throw Error('表情映射无效，请检查默认立绘。')
  const behaviors = ['idle', 'greet', 'pat', 'lifted', 'land', 'celebrate', 'comfort', 'notify', 'working', 'waiting', 'nod', 'shake', 'heart', 'shy', 'think', 'stretch', 'bow', 'clap', 'listening', 'talking']
  if (doc.behaviors && (typeof doc.behaviors !== 'object' || Array.isArray(doc.behaviors) || Object.keys(doc.behaviors).some(key => !behaviors.includes(key)) || Object.values(doc.behaviors).some(id => !ids.has(id)))) throw Error('动作立绘映射无效。')
  return doc
}
