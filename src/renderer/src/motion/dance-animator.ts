import { AnimationMixer, LoopOnce, QuaternionKeyframeTrack, Vector3, Quaternion, type Object3D, type AnimationAction } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createVRMAnimationClip, VRMAnimation, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation'
import type { VRM } from '@pixiv/three-vrm'
import type { DanceAsset } from '../../../shared/dance'

type Pose = { node: Object3D; rotation: Quaternion; position: Vector3 }[]
/** Playback adapter only. Pose estimation and the local library can be replaced independently. */
export class DanceAnimator {
  private mixer?: AnimationMixer
  private action?: AnimationAction
  private token = 0
  private blend = 0
  private from: Pose = []
  private exit: Pose = []
  private exitBlend = 1
  private nodes: Object3D[]
  constructor(private vrm: VRM) {
    this.nodes = Object.values(vrm.humanoid.normalizedHumanBones).map(b => b.node)
  }
  private pose(): Pose { return this.nodes.map(node => ({ node, rotation: node.quaternion.clone(), position: node.position.clone() })) }
  get active(): boolean { return Boolean(this.mixer) }
  async load(asset: DanceAsset): Promise<void> {
    this.stop()
    const token = ++this.token
    let animation: VRMAnimation
    if (asset.motion) {
      animation = new VRMAnimation()
      animation.duration = asset.motion.duration
      for (const track of asset.motion.tracks) animation.humanoidTracks.rotation.set(track.bone, new QuaternionKeyframeTrack(track.bone, track.times, track.rotations))
    } else {
      const loader = new GLTFLoader()
      loader.register(parser => new VRMAnimationLoaderPlugin(parser))
      const bytes = new Uint8Array(asset.bytes!)
      const gltf = await loader.parseAsync(bytes.buffer, '')
      animation = gltf.userData.vrmAnimations?.[0]
      if (!animation) throw Error('文件没有可用的 VRMA 动作。')
      // Keep the dance within the desktop window; preserve authored vertical movement.
      const translation = animation.humanoidTracks.translation.get('hips')
      if (translation) for (let i = 0; i < translation.values.length; i += 3) {
        translation.values[i] = 0; translation.values[i + 2] = 0
      }
    }
    if (token !== this.token) return
    const clip = createVRMAnimationClip(animation, this.vrm)
    if (!clip.tracks.length) throw Error('动作与角色没有可匹配的骨骼。')
    this.from = this.pose(); this.blend = 0; this.exit = []
    this.mixer = new AnimationMixer(this.vrm.scene)
    const action = this.mixer.clipAction(clip)
    this.action = action
    action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play()
  }
  update(time: number, delta: number): boolean {
    if (this.mixer) {
      if (this.action) { this.action.enabled = true; this.action.paused = false }
      this.mixer.setTime(time)
      this.blend = Math.min(1, this.blend + delta / .22)
      const alpha = this.blend * this.blend * (3 - 2 * this.blend)
      if (alpha < 1) for (const p of this.from) {
        p.node.quaternion.copy(p.rotation.clone().slerp(p.node.quaternion, alpha))
        p.node.position.copy(p.position.clone().lerp(p.node.position, alpha))
      }
      return true
    }
    if (this.exit.length) {
      this.exitBlend = Math.min(1, this.exitBlend + delta / .22)
      for (const p of this.exit) {
        p.node.quaternion.copy(p.rotation.clone().slerp(p.node.quaternion, this.exitBlend))
        p.node.position.copy(p.position.clone().lerp(p.node.position, this.exitBlend))
      }
      if (this.exitBlend === 1) this.exit = []
    }
    return false
  }
  stop(): void {
    ++this.token
    if (this.mixer) {
      this.exit = this.pose(); this.exitBlend = 0
      this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.vrm.scene); this.mixer = undefined; this.action = undefined
    }
  }
  dispose(): void { this.stop(); this.exit = []; this.from = [] }
}
