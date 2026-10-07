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
  const looping = behavior === 'idle' || behavior === 'lifted'
  const breathe = Math.sin(looping ? phase * Math.PI * 4 : time * 1.8)
  const sway = Math.sin(looping ? phase * Math.PI * 2 : time * 0.8)
  const pose: Pose = {
    spine: [breathe * 0.012, 0, sway * 0.014], chest: [0, 0, -sway * 0.009],
    head: [0, 0, -sway * 0.012],
    leftUpperArm: [breathe * 0.015, 0, 1.18], rightUpperArm: [0, 0, -1.18],
    leftLowerArm: [0, -0.12, 0.08], rightLowerArm: [0, 0.12, -0.08]
  }
  if (behavior === 'greet' || behavior === 'notify') {
    pose.rightUpperArm = [0, -0.15 * envelope, -1.18 + 1.7 * envelope]
    pose.rightLowerArm = [0, 0.12, -0.08 - envelope * (1.45 + Math.sin(time * 13) * 0.12)]
    pose.rightHand = [0, 0, -Math.sin(time * 13) * envelope * 0.18]
    pose.head = [0, 0, 0.08 * envelope]
  } else if (behavior === 'pat') {
    pose.head = [-0.12 * envelope, Math.sin(time * 3) * envelope * 0.04, -0.15 * envelope]
    pose.neck = [0, 0, -0.05 * envelope]
    pose.leftUpperArm = [0, 0, 1.18 - 0.12 * envelope]
    pose.rightUpperArm = [0, 0, -1.18 + 0.12 * envelope]
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
      const looping = behavior === 'idle' || behavior === 'lifted'
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
      if (this.active) this.active.crossFadeTo(next, 0.24, false)
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
}
