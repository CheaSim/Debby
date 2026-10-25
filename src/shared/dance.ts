/** Portable normalized VRM humanoid rotations. No renderer or pose-estimator dependency. */
export const danceBones = ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot'] as const
export type DanceBone = typeof danceBones[number]
export interface MotionTrack { bone: DanceBone; times: number[]; rotations: number[] }
export interface DanceMotion {
  version: 1
  name: string
  duration: number
  source: 'video' | 'import' | 'builtin'
  engine: string
  tracks: MotionTrack[]
  quality?: { coverage: number; frames: number; missing: number; longestGap: number }
}
export interface DanceEntry { id: string; name: string; duration: number; format: 'motion' | 'vrma'; source: DanceMotion['source']; createdAt: number; quality?: DanceMotion['quality'] }
export interface DanceAsset { entry: DanceEntry; motion?: DanceMotion; bytes?: Uint8Array }
export interface DancePlayback { id: string; status: 'playing' | 'paused'; offset: number; startedAt: number; speed: number; loop: boolean; origin: 'user' | 'agent' | 'assistant' }
export interface DanceState { revision: number; library: DanceEntry[]; playback?: DancePlayback }
export type DanceCommand = { action: 'play'; id: string; speed?: number; loop?: boolean } | { action: 'pause' | 'resume' | 'stop' } | { action: 'seek'; time: number }
export interface DanceApi {
  getDanceState(): Promise<DanceState>
  getDanceAsset(id: string): Promise<DanceAsset>
  saveDance(input: { motion: DanceMotion } | { name: string; bytes: Uint8Array }): Promise<DanceEntry>
  removeDance(id: string): Promise<void>
  controlDance(command: DanceCommand): Promise<DanceState>
  onDanceState(listener: (state: DanceState) => void): () => void
  onDanceCaptureStop(listener: () => void): () => void
}
export const emptyDanceState = (): DanceState => ({ revision: 0, library: [] })
export const danceLimits = { videoSeconds: 60, motionSeconds: 180, frames: 5401, fileBytes: 16 * 1024 * 1024, videoBytes: 256 * 1024 * 1024, library: 64 } as const
export function dancePosition(playback: DancePlayback, duration: number, now = Date.now()): number {
  const time = playback.offset + (playback.status === 'playing' ? Math.max(0, now - playback.startedAt) / 1000 * playback.speed : 0)
  return playback.loop ? time % duration : Math.min(time, duration)
}
export function validateMotion(value: unknown): DanceMotion {
  const motion = value as DanceMotion
  if (!motion || motion.version !== 1 || typeof motion.name !== 'string' || !motion.name.trim() || motion.name.length > 64 ||
    !['video', 'import', 'builtin'].includes(motion.source) || typeof motion.engine !== 'string' || motion.engine.length > 100 ||
    !Number.isFinite(motion.duration) || motion.duration < .1 || motion.duration > danceLimits.motionSeconds ||
    !Array.isArray(motion.tracks) || !motion.tracks.length || motion.tracks.length > danceBones.length) throw Error('动作文件格式不正确，或超出 180 秒限制。')
  const names = new Set<string>()
  for (const track of motion.tracks) {
    if (!track || !danceBones.includes(track.bone) || names.has(track.bone) || !Array.isArray(track.times) || !Array.isArray(track.rotations) ||
      track.times.length < 2 || track.times.length > danceLimits.frames || track.rotations.length !== track.times.length * 4) throw Error('动作骨骼轨道不正确。')
    names.add(track.bone)
    for (let i = 0; i < track.times.length; i++) {
      const t = track.times[i], q = track.rotations.slice(i * 4, i * 4 + 4)
      if (!Number.isFinite(t) || t < 0 || t > motion.duration + .001 || (i > 0 && t <= track.times[i - 1]) || q.some(n => !Number.isFinite(n)) || Math.abs(Math.hypot(...q) - 1) > .02) throw Error('动作时间或旋转值不正确。')
    }
  }
  if (motion.quality && (!Number.isFinite(motion.quality.coverage) || motion.quality.coverage < 0 || motion.quality.coverage > 1 || !Number.isInteger(motion.quality.frames) || motion.quality.frames < 1 || motion.quality.frames > danceLimits.frames || !Number.isInteger(motion.quality.missing) || motion.quality.missing < 0 || motion.quality.missing > motion.quality.frames || !Number.isFinite(motion.quality.longestGap) || motion.quality.longestGap < 0 || motion.quality.longestGap > motion.duration + .1)) throw Error('动作识别质量信息不正确。')
  // Whitelist public fields; do not persist source video, paths, or estimator internals.
  return { version: 1, name: motion.name.trim(), duration: motion.duration, source: motion.source, engine: motion.engine,
    tracks: motion.tracks.map(t => ({ bone: t.bone, times: [...t.times], rotations: [...t.rotations] })), quality: motion.quality ? { coverage: motion.quality.coverage, frames: motion.quality.frames, missing: motion.quality.missing, longestGap: motion.quality.longestGap } : undefined }
}

/** Small original step-touch routine for a first preview; never presented as learned footage. */
export function createWelcomeDance(): DanceMotion {
  const duration = 8, times = Array.from({ length: 193 }, (_, i) => i / 24)
  const rotations = (bone: DanceBone, t: number): number[] => {
    const beat = Math.sin(t * Math.PI * 2), sway = Math.sin(t * Math.PI), lift = Math.max(0, beat)
    const e: Partial<Record<DanceBone, number[]>> = {
      hips: [0, sway * .12, sway * .055], spine: [0, -sway * .08, -sway * .045], head: [0, sway * .06, sway * .06],
      leftUpperArm: [-beat * .16, -.12, -1.05 + (1 + sway) * .38], rightUpperArm: [beat * .16, .12, 1.05 - (1 - sway) * .38],
      leftLowerArm: [0, -.18, -.35 - (1 + sway) * .4], rightLowerArm: [0, .18, .35 + (1 - sway) * .4],
      leftUpperLeg: [-lift * .16, 0, sway * .065], rightUpperLeg: [-Math.max(0, -beat) * .16, 0, sway * .065],
      leftLowerLeg: [lift * .26, 0, 0], rightLowerLeg: [Math.max(0, -beat) * .26, 0, 0]
    }
    const [x, y, z] = (e[bone] ?? [0, 0, 0]).map(n => n / 2)
    const a = Math.cos(x), b = Math.cos(y), c = Math.cos(z), d = Math.sin(x), f = Math.sin(y), g = Math.sin(z)
    return [d * b * c + a * f * g, a * f * c - d * b * g, a * b * g + d * f * c, a * b * c - d * f * g]
  }
  return { version: 1, name: 'Debby 的小小律动', duration, source: 'builtin', engine: 'Debby original keyframes', tracks: danceBones.map(bone => ({ bone, times, rotations: times.flatMap(t => rotations(bone, t)) })) }
}
