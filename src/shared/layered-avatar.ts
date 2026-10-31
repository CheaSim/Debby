import type { PetBehavior } from './pet-behavior'
import type { PetMood } from './types'
import type { ExpressionDirective } from './avatar-performance'

export const layeredAvatarLimits = { bytes: 64 * 1024 * 1024, timeout: 90_000 } as const
export interface LayeredRig {
  canvas: { w: number; h: number }
  layers: { name: string; z: number }[]
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
export interface LayeredAvatarAsset { name: string; file: Blob; rig: LayeredRig }
export interface LayeredFrameInput { time: number; mood: PetMood; behavior: PetBehavior; mouth: number; gaze: { x: number; y: number }; reducedMotion?: boolean }
export interface LayeredAvatarDriver {
  frame(params: Record<string, number>, dt: number, time: number, expression?: ExpressionDirective): void
  dispose(): void
}
export interface LayeredAvatarSurface extends LayeredAvatarDriver { canvas: HTMLCanvasElement; visible(): boolean }
/** Portable mapping: expressions/head/arm deformation, not VRM skeletal dance. */
export function layeredParameters({ time: t, mood, behavior, mouth, gaze, reducedMotion }: LayeredFrameInput): Record<string, number> {
  const clamp = (n: number): number => Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0
  const happy = mood === 'bullish' || ['celebrate', 'heart', 'clap', 'greet', 'pat'].includes(behavior)
  const sad = mood === 'bearish' || behavior === 'comfort'
  const blinkPhase = t % 4.1
  const blink = blinkPhase < .18 ? Math.abs(blinkPhase - .09) / .09 : 1
  const p = { angleX: clamp(gaze.x) * .35, angleY: -clamp(gaze.y) * .25, angleZ: .07 * Math.sin(t * .6), body: .07 * Math.sin(t * .8),
    eyeOpenL: blink, eyeOpenR: blink, eyeX: clamp(gaze.x) * .6, eyeY: -clamp(gaze.y) * .4,
    mouthOpen: Math.max(0, clamp(mouth)), mouthForm: happy ? .65 : sad ? -.35 : .1, brow: sad ? -.3 : happy ? .2 : 0,
    browAngSym: sad ? .35 : 0, irisScale: 1, eyeScaleL: 1, eyeScaleR: 1, armY: 0, breath: .5 + .5 * Math.sin(t * 1.85), breathHead: .5 + .5 * Math.sin(t * 1.85 - .6) }
  if (behavior === 'nod') p.angleY += .5 * Math.sin(t * 7)
  if (behavior === 'shake') p.angleX += .6 * Math.sin(t * 7)
  if (['shy', 'heart', 'pat', 'comfort'].includes(behavior)) p.angleZ += behavior === 'shy' ? -.5 : .3
  if (['think', 'working', 'waiting', 'listening'].includes(behavior)) { p.angleZ += .25; p.angleY -= .12; p.brow += .15 }
  if (['notify', 'lifted'].includes(behavior)) { p.eyeOpenL = p.eyeOpenR = 1; p.brow = .6; p.angleY = .3 }
  if (behavior === 'bow') p.angleY -= .7 * (.5 + .5 * Math.sin(t * 2.2))
  if (['greet', 'clap', 'stretch', 'celebrate'].includes(behavior)) { p.armY = behavior === 'stretch' ? .8 : .5 + .3 * Math.sin(t * 7); p.body += .12 * Math.sin(t * 3) }
  if (reducedMotion) { p.angleX = p.angleY = p.angleZ = p.body = p.armY = p.breath = p.breathHead = 0; p.eyeOpenL = p.eyeOpenR = 1 }
  return p
}
