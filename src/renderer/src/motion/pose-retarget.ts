import { Matrix4, Quaternion, Vector3 } from 'three'
import { danceBones, validateMotion, type DanceBone, type DanceMotion } from '../../../shared/dance'

export interface PosePoint { x: number; y: number; z: number; visibility?: number }
export interface PoseSample { time: number; world: PosePoint[]; image?: PosePoint[] }
type Pose = Partial<Record<DanceBone, Quaternion>>
const identity = new Quaternion()
const up = new Vector3(0, 1, 0), down = new Vector3(0, -1, 0)
const position = (p: PosePoint): Vector3 => new Vector3(p.x, -p.y, -p.z)
const visible = (points: PosePoint[], ids: number[]): boolean => ids.every(i => points[i] && [points[i].x, points[i].y, points[i].z].every(Number.isFinite) && (points[i].visibility ?? 0) >= .45)
const mid = (a: Vector3, b: Vector3): Vector3 => a.clone().add(b).multiplyScalar(.5)
const local = (parent: Quaternion, world: Quaternion): Quaternion => parent.clone().invert().multiply(world).normalize()
function bodyFrame(x: Vector3, y: Vector3): Quaternion | undefined {
  const z = x.clone().cross(y)
  if (x.lengthSq() < .0001 || z.lengthSq() < .0001) return
  x.normalize(); z.normalize(); y = z.clone().cross(x).normalize()
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z)).normalize()
}
function swing(rest: Vector3, direction: Vector3): Quaternion | undefined {
  if (direction.lengthSq() < .0001) return
  return new Quaternion().setFromUnitVectors(rest, direction.normalize())
}

/** Canonical VRM 1.0 normalized pose; the rendering adapter handles VRM 0.x axes. */
export function solvePose(points: PosePoint[]): Pose | undefined {
  if (!visible(points, [11, 12, 23, 24])) return
  const p = points.map(position)
  const torso = mid(p[11], p[12]).sub(mid(p[23], p[24]))
  const hips = bodyFrame(p[23].clone().sub(p[24]), torso.clone())
  const chest = bodyFrame(p[11].clone().sub(p[12]), torso.clone())
  if (!hips || !chest) return
  const spine = hips.clone().slerp(chest, .5)
  const result: Pose = { hips, spine: local(hips, spine), chest: local(spine, chest), neck: identity.clone(), head: identity.clone() }
  if (visible(points, [7, 8])) {
    const head = bodyFrame(p[7].clone().sub(p[8]), up.clone())
    if (head && chest.angleTo(head) < 1.3) result.head = local(chest, head)
  }
  for (const [side, shoulder, elbow, wrist, hip, knee, ankle, heel, toe, sign] of [
    ['left', 11, 13, 15, 23, 25, 27, 29, 31, 1], ['right', 12, 14, 16, 24, 26, 28, 30, 32, -1]
  ] as const) {
    const armAxis = new Vector3(sign, 0, 0)
    if (visible(points, [shoulder, elbow])) {
      const upper = swing(armAxis, p[elbow].clone().sub(p[shoulder]))
      if (upper) {
        result[`${side}UpperArm`] = local(chest, upper)
        if (visible(points, [elbow, wrist])) {
          const lower = swing(armAxis, p[wrist].clone().sub(p[elbow]))
          if (lower) result[`${side}LowerArm`] = local(upper, lower)
        }
      }
    }
    if (visible(points, [hip, knee])) {
      const upper = swing(down, p[knee].clone().sub(p[hip]))
      if (upper) {
        result[`${side}UpperLeg`] = local(hips, upper)
        if (visible(points, [knee, ankle])) {
          const lower = swing(down, p[ankle].clone().sub(p[knee]))
          if (lower) {
            result[`${side}LowerLeg`] = local(upper, lower)
            if (visible(points, [heel, toe])) {
              const direction = p[toe].clone().sub(p[heel]); direction.y *= .3
              const foot = swing(new Vector3(0, 0, 1), direction)
              if (foot) result[`${side}Foot`] = local(lower, foot)
            }
          }
        }
      }
    }
  }
  return result
}

/** Confidence gating, missing-data interpolation and forward/backward quaternion filtering. */
export function retargetVideo(samples: PoseSample[], name: string, duration: number): DanceMotion {
  if (samples.length < 3 || duration < .1) throw Error('视频片段太短。')
  const poses = samples.map(s => solvePose(s.world))
  let missing = 0, gap = 0, longestGap = 0
  samples.forEach((sample, i) => {
    const full = poses[i] && visible(sample.world, [11, 12, 23, 24, 25, 26, 27, 28])
    if (!full) { missing++; gap += i > 0 ? sample.time - samples[i - 1].time : 1 / 24; longestGap = Math.max(longestGap, gap) } else gap = 0
  })
  const coverage = 1 - missing / samples.length
  if (coverage < .55) throw Error(`仅 ${Math.round(coverage * 100)}% 的帧能看清全身。请换成单人、全身入镜、遮挡更少的视频。`)
  const tracks = danceBones.map(bone => {
    const raw = poses.map(p => p?.[bone]?.clone())
    const fallback = new Quaternion()
    if (bone === 'leftUpperArm' || bone === 'rightUpperArm') fallback.setFromAxisAngle(new Vector3(0, 0, 1), bone === 'leftUpperArm' ? -1.18 : 1.18)
    const previous: number[] = [], next: number[] = []
    let index = -1
    for (let i = 0; i < raw.length; i++) { if (raw[i]) index = i; previous[i] = index }
    index = -1
    for (let i = raw.length - 1; i >= 0; i--) { if (raw[i]) index = i; next[i] = index }
    const filled = raw.map((q, i) => {
      if (q) return q
      const before = previous[i], after = next[i]
      if (before >= 0 && after >= 0) return raw[before]!.clone().slerp(raw[after]!, (samples[i].time - samples[before].time) / (samples[after].time - samples[before].time))
      return raw[before >= 0 ? before : after]?.clone() ?? fallback.clone()
    })
    // Bound impossible frame-to-frame flips, then filter in both directions to reduce lag.
    for (let i = 1; i < filled.length; i++) {
      const angle = filled[i - 1].angleTo(filled[i]), dt = samples[i].time - samples[i - 1].time
      filled[i] = filled[i - 1].clone().slerp(filled[i], Math.min(.65, dt * 12 / Math.max(.0001, angle)))
    }
    for (let i = filled.length - 2; i >= 0; i--) filled[i].slerp(filled[i + 1], .3)
    return { bone, times: samples.map(s => s.time), rotations: filled.flatMap(q => q.normalize().toArray().map(n => Math.round(n * 1e6) / 1e6)) }
  })
  return validateMotion({ version: 1, name, duration, source: 'video', engine: 'MediaPipe Full v1 / Debby normalized VRM retarget v1', tracks,
    quality: { coverage, frames: samples.length, missing, longestGap } })
}
