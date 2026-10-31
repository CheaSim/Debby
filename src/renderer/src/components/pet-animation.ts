import * as THREE from 'three'
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'
import { behaviorDuration, type PetBehavior } from '../../../shared/pet-behavior'

type Rotation = [number, number, number]
type Pose = Partial<Record<VRMHumanBoneName, Rotation>>
const bones: VRMHumanBoneName[] = [
  'hips', 'spine', 'chest', 'neck', 'head', 'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand',
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg'
]

function poseAt(behavior: PetBehavior, time: number, duration: number): Pose {
  const phase = time / duration
  const envelope = Math.sin(Math.PI * phase) ** 2
  const looping = !Number.isFinite(behaviorDuration[behavior])
  const breathe = Math.sin(looping ? phase * Math.PI * 4 : time * 1.8)
  const sway = Math.sin(looping ? phase * Math.PI * 2 : time * 0.8)
  const pose: Pose = {
    spine: [breathe * 0.012, 0, sway * 0.014], chest: [0, 0, -sway * 0.009],
    head: [breathe * 0.008, 0, -sway * 0.025],
    leftUpperArm: [breathe * 0.015, 0, 1.18], rightUpperArm: [0, 0, -1.18],
    leftLowerArm: [0, -0.12, 0.08], rightLowerArm: [0, 0.12, -0.08]
  }
  if (behavior === 'nod') {
    pose.head = [Math.sin(time * 7) * envelope * 0.16, 0, 0.035 * envelope]
  } else if (behavior === 'shake') {
    pose.head = [0, Math.sin(time * 7) * envelope * 0.22, 0]
  } else if (behavior === 'heart') {
    pose.leftUpperArm = [-0.35 * envelope, -0.18 * envelope, 1.18 - 0.4 * envelope]
    pose.rightUpperArm = [-0.35 * envelope, 0.18 * envelope, -1.18 + 0.4 * envelope]
    pose.leftLowerArm = [0, -0.25 * envelope, 0.08 + 1.35 * envelope]
    pose.rightLowerArm = [0, 0.25 * envelope, -0.08 - 1.35 * envelope]
    pose.head = [-0.04 * envelope, 0, -0.1 * envelope]
  } else if (behavior === 'shy') {
    pose.head = [0.12 * envelope, 0.1 * envelope, 0.12 * envelope]
    pose.rightUpperArm = [-0.26 * envelope, 0, -1.18 + 0.35 * envelope]
    pose.rightLowerArm = [0, 0.15 * envelope, -0.08 - 1.65 * envelope]
  } else if (behavior === 'think') {
    pose.head = [0.08 * envelope, -0.1 * envelope, -0.09 * envelope]
    pose.rightUpperArm = [-0.3 * envelope, -0.15 * envelope, -1.18 + 0.2 * envelope]
    pose.rightLowerArm = [0, 0.35 * envelope, -0.08 - 1.8 * envelope]
  } else if (behavior === 'stretch') {
    pose.leftUpperArm = [0, 0, 1.18 - 2.65 * envelope]
    pose.rightUpperArm = [0, 0, -1.18 + 2.65 * envelope]
    pose.spine = [-0.08 * envelope, 0, 0]
    pose.head = [-0.1 * envelope, 0, 0]
  } else if (behavior === 'bow') {
    pose.spine = [0.28 * envelope, 0, 0]
    pose.chest = [0.12 * envelope, 0, 0]
    pose.head = [0.12 * envelope, 0, 0]
  } else if (behavior === 'clap') {
    const clap = Math.sin(time * 13) * 0.09 * envelope
    pose.leftUpperArm = [-0.45 * envelope, -0.3 * envelope, 1.18 - 0.28 * envelope]
    pose.rightUpperArm = [-0.45 * envelope, 0.3 * envelope, -1.18 + 0.28 * envelope]
    pose.leftLowerArm = [0, -0.6 * envelope, 0.08 + 1.25 * envelope + clap]
    pose.rightLowerArm = [0, 0.6 * envelope, -0.08 - 1.25 * envelope - clap]
  } else if (behavior === 'listening') {
    pose.head = [0.025 + breathe * 0.015, sway * 0.025, -0.1]
  } else if (behavior === 'talking') {
    const emphasis = Math.sin(phase * Math.PI) ** 2
    pose.head = [breathe * 0.025, sway * 0.035, sway * 0.04]
    pose.rightUpperArm = [-0.12 * emphasis, 0, -1.18 + .23 * emphasis]
    pose.rightLowerArm = [0, .2 * emphasis, -.08 - (.4 - breathe * .12) * emphasis]
    pose.leftUpperArm = [-.04 * emphasis, 0, 1.18 - .1 * emphasis]
    pose.leftLowerArm = [0, -.12, .08 + .2 * emphasis]
    pose.rightHand = [0, 0, sway * .06 * emphasis]
  } else if (behavior === 'working') {
    pose.head = [0.08 + breathe * 0.015, sway * 0.025, -0.04]
    pose.rightUpperArm = [-0.18, -0.12, -1.0]
    pose.rightLowerArm = [0, 0.25, -0.9 + breathe * 0.025]
  } else if (behavior === 'waiting') {
    pose.head = [0, sway * 0.035, 0.13 + breathe * 0.012]
    pose.leftUpperArm = [-0.18, -0.1, 1.0]
    pose.leftLowerArm = [0, -0.2, 0.85]
  } else if (behavior === 'greet' || behavior === 'notify') {
    pose.rightUpperArm = [0, -0.15 * envelope, -1.18 + 1.7 * envelope]
    pose.rightLowerArm = [0, 0.12, -0.08 - envelope * (1.45 + Math.sin(time * 13) * 0.12)]
    pose.rightHand = [0, 0, -Math.sin(time * 13) * envelope * 0.18]
    pose.head = [0, 0, 0.08 * envelope]
  } else if (behavior === 'pat') {
    pose.head = [-0.12 * envelope, Math.sin(time * 3) * envelope * 0.04, -0.15 * envelope]
    pose.neck = [0, 0, -0.05 * envelope]
    pose.leftUpperArm = [-0.12 * envelope, -0.1 * envelope, 1.18 - 0.2 * envelope]
    pose.rightUpperArm = [-0.12 * envelope, 0.1 * envelope, -1.18 + 0.2 * envelope]
    pose.leftLowerArm = [0, -0.12, 0.08 + 0.38 * envelope]
    pose.rightLowerArm = [0, 0.12, -0.08 - 0.38 * envelope]
  } else if (behavior === 'lifted') {
    pose.spine = [0.03, 0, Math.sin(phase * Math.PI * 4) * 0.04]
    pose.leftUpperArm = [-0.1, 0, 0.68]
    pose.rightUpperArm = [-0.1, 0, -0.68]
    pose.leftUpperLeg = [-0.18, 0, 0.04]
    pose.rightUpperLeg = [-0.12, 0, -0.04]
    pose.leftLowerLeg = [0.35, 0, 0]
    pose.rightLowerLeg = [0.28, 0, 0]
  } else if (behavior === 'land') {
    const settle = Math.sin(Math.PI * phase) * (1 - phase)
    pose.spine = [0.08 * settle, 0, 0]
    pose.leftUpperLeg = [-0.18 * settle, 0, 0]
    pose.rightUpperLeg = [-0.18 * settle, 0, 0]
    pose.leftLowerLeg = [0.3 * settle, 0, 0]
    pose.rightLowerLeg = [0.3 * settle, 0, 0]
  } else if (behavior === 'celebrate') {
    pose.leftUpperArm = [-0.1 * envelope, 0, 1.18 - 0.65 * envelope]
    pose.rightUpperArm = [-0.1 * envelope, 0, -1.18 + 0.65 * envelope]
    pose.leftLowerArm = [0, 0, 0.08 + 1.1 * envelope]
    pose.rightLowerArm = [0, 0, -0.08 - 1.1 * envelope]
    pose.head = [-0.07 * envelope, 0, Math.sin(time * 4) * envelope * 0.05]
  } else if (behavior === 'comfort') {
    pose.spine = [0.04 * envelope, 0, 0]
    pose.head = [0.1 * envelope, 0, -0.06 * envelope]
    pose.leftUpperArm = [-0.25 * envelope, -0.25 * envelope, 1.18 - 0.15 * envelope]
    pose.leftLowerArm = [0, -0.4 * envelope, 0.08 + 0.8 * envelope]
  }
  return pose
}

export class PetAnimator {
  private mixer: THREE.AnimationMixer
  private actions = new Map<PetBehavior, THREE.AnimationAction>()
  private active?: THREE.AnimationAction
  private previous?: THREE.AnimationAction
  private behavior?: PetBehavior

  constructor(private vrm: VRM) {
    this.mixer = new THREE.AnimationMixer(vrm.scene)
    for (const behavior of Object.keys(behaviorDuration) as PetBehavior[]) {
      const looping = !Number.isFinite(behaviorDuration[behavior])
      const duration = looping ? 4 : behaviorDuration[behavior]
      const samples = Math.ceil(duration * 12)
      const times = Array.from({ length: samples + 1 }, (_, index) => index / samples * duration)
      const tracks = bones.flatMap((name) => {
        const bone = vrm.humanoid.getNormalizedBoneNode(name)
        if (!bone) return []
        const values = times.flatMap((time) => {
          const rotation = poseAt(behavior, time, duration)[name] ?? [0, 0, 0]
          return new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)).toArray()
        })
        return [new THREE.QuaternionKeyframeTrack(`${bone.uuid}.quaternion`, times, values)]
      })
      const action = this.mixer.clipAction(new THREE.AnimationClip(behavior, duration, tracks))
      action.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, looping ? Infinity : 1)
      action.clampWhenFinished = true
      this.actions.set(behavior, action)
    }
  }

  update(behavior: PetBehavior, delta: number, reducedMotion: boolean): void {
    const target = reducedMotion ? 'idle' : behavior
    if (target !== this.behavior) {
      this.previous?.stop()
      const next = this.actions.get(target)!
      next.reset().setEffectiveWeight(1).play()
      if (this.active && this.active !== next) this.active.crossFadeTo(next, 0.24, false)
      this.previous = this.active
      this.active = next
      this.behavior = target
    }
    this.mixer.update(reducedMotion ? 0 : delta)
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.vrm.scene)
  }

  restart(): void { this.behavior = undefined }
}
