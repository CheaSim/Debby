import type { PetBehavior } from './pet-behavior'
import type { PetMood } from './types'
import type { ExpressionDirective } from './avatar-performance'

export const layeredAvatarLimits = { bytes: 64 * 1024 * 1024, timeout: 90_000 } as const
export interface LayeredRig {
  canvas: { w: number; h: number }
  layers: { name: string; z: number; x?: number; y?: number; w?: number; h?: number }[]
  anchors: { face: { x0: number; x1: number; y0: number; y1: number }; neckPivot: { cx: number; cy: number } }
  warnings: string[]
  synth: { eye: boolean; mouth: boolean }
}

/** Same semantic expression contract, mapped to the 2.5D rigger's parameters. */
export function applyLayeredPerformance(params: Record<string, number>, expression?: ExpressionDirective, reducedMotion = false): Record<string, number> {
  if (!expression) return params
  const i = Math.max(0, Math.min(1, expression.intensity)), p: Record<string, number> = { ...params, mouthForm: 0, brow: 0, browAngSym: 0, eyeScaleL: 1, eyeScaleR: 1, irisScale: 1 }
  switch (expression.emotion) {
    case 'happy': case 'proud': p.mouthForm = .8 * i; p.brow = .2 * i; break
    case 'caring': p.mouthForm = .35 * i; p.browAngSym = .15 * i; break
    case 'sad': p.mouthForm = -.5 * i; p.brow = -.35 * i; p.browAngSym = .45 * i; break
    case 'shy': p.mouthForm = .45 * i; p.brow = -.12 * i; if (!reducedMotion) p.angleZ += .25 * i; break
    case 'surprised': p.brow = .7 * i; p.irisScale = 1 - .15 * i; break
    case 'curious': p.brow = .3 * i; if (!reducedMotion) p.angleZ -= .25 * i; break
    case 'playful': p.mouthForm = .65 * i; if (!reducedMotion) p.eyeOpenL = Math.min(p.eyeOpenL, 1 - i); break
  }
  return p
}
export interface LayeredAvatarAsset { name: string; file: Blob; rig: LayeredRig; motionScale?: number }
export interface LayeredFrameInput { time: number; mood: PetMood; behavior: PetBehavior; mouth: number; gaze: { x: number; y: number }; reducedMotion?: boolean; motionScale?: number }
export const defaultLayeredMotionScale = 1.9
export function layeredMotionScale(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(.6, Math.min(2.4, value)) : defaultLayeredMotionScale }
export interface LayeredAvatarDriver {
  frame(params: Record<string, number>, dt: number, time: number, expression?: ExpressionDirective, context?: { behavior: PetBehavior; reducedMotion: boolean; showSkeleton?: boolean; hiddenLayers?: readonly number[]; pose?: string }): void
  dispose(): void
}
export interface LayeredAvatarSurface extends LayeredAvatarDriver { canvas: HTMLCanvasElement; visible(): boolean; viewRig?(): LayeredRig }
export interface LayeredSurfaceOptions { expressionTransitionMs?: number }
/** Portable mapping: expressions/head/arm deformation, not VRM skeletal dance. */
export function layeredParameters({ time: t, mood, behavior, mouth, gaze, reducedMotion, motionScale }: LayeredFrameInput): Record<string, number> {
  const clamp = (n: number): number => Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0
  const happy = mood === 'bullish' || ['celebrate', 'heart', 'clap', 'greet', 'pat'].includes(behavior)
  const sad = mood === 'bearish' || behavior === 'comfort'
  const blinkPhase = t % 4.1
  const blink = blinkPhase < .18 ? Math.abs(blinkPhase - .09) / .09 : 1
  const p = { angleX: clamp(gaze.x) * .35, angleY: -clamp(gaze.y) * .25, angleZ: .16 * Math.sin(t * .6), body: .11 * Math.sin(t * .8),
    eyeOpenL: blink, eyeOpenR: blink, eyeX: clamp(gaze.x) * .6, eyeY: -clamp(gaze.y) * .4,
    mouthOpen: Math.max(0, clamp(mouth)), mouthForm: happy ? .65 : sad ? -.35 : .1, brow: sad ? -.3 : happy ? .2 : 0,
    browAngSym: sad ? .35 : 0, irisScale: 1, eyeScaleL: 1, eyeScaleR: 1, armY: 0, armL: 0, armR: 0, breath: .5 + .5 * Math.sin(t * 1.85), breathHead: .5 + .5 * Math.sin(t * 1.85 - .6) }
  if (behavior === 'nod') p.angleY += .5 * Math.sin(t * 7)
  if (behavior === 'shake') p.angleX += .6 * Math.sin(t * 7)
  if (['shy', 'heart', 'pat', 'comfort'].includes(behavior)) p.angleZ += behavior === 'shy' ? -.5 : .3
  if (['think', 'working', 'waiting', 'listening'].includes(behavior)) { p.angleZ += .25; p.angleY -= .12; p.brow += .15 }
  if (behavior === 'talking') {
    p.angleY += .045 * Math.sin(t * 4.8) * (.35 + p.mouthOpen)
    p.angleZ += .1 * Math.sin(t * 1.6)
    p.armY = .17 + .13 * Math.sin(t * 2.8)
    p.body += .025 * Math.sin(t * 2.8)
  }
  if (['notify', 'lifted'].includes(behavior)) { p.eyeOpenL = p.eyeOpenR = 1; p.brow = .6; p.angleY = .3 }
  if (behavior === 'bow') p.angleY -= .7 * (.5 + .5 * Math.sin(t * 2.2))
  if (['greet', 'clap', 'stretch', 'celebrate'].includes(behavior)) { p.armY = behavior === 'stretch' ? .8 : .5 + .3 * Math.sin(t * 7); p.body += .12 * Math.sin(t * 3) }
  if (behavior === 'greet') { p.armR = .55 + .4 * Math.sin(t * 7); p.armL = .12 * Math.sin(t * 3); p.angleZ += .16 * Math.sin(t * 2.5) }
  if (behavior === 'celebrate' || behavior === 'stretch') { p.armL = p.armR = .45 + .2 * Math.sin(t * 4) }
  if (behavior === 'talking') { p.armR = .14 * Math.sin(t * 2.8); p.armL = .1 * Math.sin(t * 2.8 - .7) }
  const scale = layeredMotionScale(motionScale)
  for (const key of ['angleX', 'angleY', 'angleZ', 'body', 'armY', 'armL', 'armR'] as const) p[key] *= scale
  if (reducedMotion) { p.angleX = p.angleY = p.angleZ = p.body = p.armY = p.armL = p.armR = p.breath = p.breathHead = 0; p.eyeOpenL = p.eyeOpenR = 1 }
  return p
}
