import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from '@pixiv/three-vrm'
import { RefreshCw } from 'lucide-react'
import type { PetMood } from '../../../shared/types'
import { platformApi } from '../platform-api'
import { behaviorDuration, PetBehaviorController, type PetBehavior } from '../../../shared/pet-behavior'
import type { AgentShellState } from '../../../shared/shell'
import { PetAnimator } from './pet-animation'
import { applyPerformanceFace, faceChannels, PetExpressionController, type FaceChannel } from '../../../shared/pet-expression'
import { bindPetExpressions } from './pet-face-bindings'
import { DanceAnimator } from '../motion/dance-animator'
import { dancePosition, type DanceAsset, type DancePlayback } from '../../../shared/dance'
import type { AvatarCue } from '../../../shared/avatar'
import { danceExpressionAt, type AvatarPerformance } from '../../../shared/avatar-performance'

interface ThreeDPetProps {
  performance?: AvatarPerformance
  cue?: AvatarCue
  activity?: 'listening' | 'talking' | 'working'
  danceAsset?: DanceAsset
  dancePlayback?: DancePlayback
  agentShell: AgentShellState
  mouthLevel?: number
  mood: PetMood
  portrait: boolean
  viewReset: number
  rotating: boolean
  draggable: boolean
  onBehavior: (behavior: PetBehavior) => void
}

const modelUrl = new URL('models/mate-engine/Zome.vrm', new URL(import.meta.env.BASE_URL, window.location.href)).href

export function ThreeDPet({ mood, portrait, viewReset, rotating, draggable, onBehavior, mouthLevel = 0, agentShell, danceAsset, dancePlayback, cue, activity, performance }: ThreeDPetProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const moodRef = useRef(mood)
  const cueRef = useRef(cue)
  const activityRef = useRef(activity)
  const performanceRef = useRef(performance); performanceRef.current = performance
  cueRef.current = cue
  activityRef.current = activity
  const mouthRef = useRef(mouthLevel)
  const agentRef = useRef(agentShell)
  const danceRef = useRef({ asset: danceAsset, playback: dancePlayback })
  danceRef.current = { asset: danceAsset, playback: dancePlayback }
  const portraitRef = useRef(portrait)
  const interactionRef = useRef({ rotating, draggable })
  const resetViewRef = useRef<(() => void) | null>(null)
  const behaviorListener = useRef(onBehavior)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [progress, setProgress] = useState(0)
  const [attempt, setAttempt] = useState(0)
  moodRef.current = mood
  agentRef.current = agentShell
  mouthRef.current = Number.isFinite(mouthLevel) ? Math.min(1, Math.max(0, mouthLevel)) : 0
  portraitRef.current = portrait
  interactionRef.current = { rotating, draggable }
  behaviorListener.current = onBehavior

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    setState('loading')
    setProgress(0)
    let renderer: THREE.WebGLRenderer
    const context = canvas.getContext('2d', { alpha: true })
    try {
      if (!context) throw new Error('Transparent presentation canvas is unavailable')
      // Blit WebGL frames to Canvas2D for reliable transparent Windows compositing.
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.NoToneMapping
      renderer.setClearColor(0x000000, 0)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    } catch (error) {
      console.error('3D renderer is unavailable', error)
      setState('error')
      return
    }

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20)
    camera.position.set(0, 0.84, 4)
    camera.lookAt(0, 0.84, 0)
    scene.add(new THREE.HemisphereLight(0xffffff, 0xa7b6c4, 0.75))
    const key = new THREE.DirectionalLight(0xfff4ee, 1.05)
    key.position.set(-2, 3, 4)
    const fill = new THREE.DirectionalLight(0xe6f4ff, 0.3)
    fill.position.set(3, 2, 3)
    const rim = new THREE.DirectionalLight(0xffdbe8, 0.4)
    rim.position.set(0, 2, -3)
    scene.add(key, fill, rim)

    const root = new THREE.Group()
    root.rotation.y = -0.12
    scene.add(root)
    const lookTarget = new THREE.Object3D()
    lookTarget.position.set(0, 1.45, 3)
    scene.add(lookTarget)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let vrm: VRM | undefined
    let animator: PetAnimator | undefined
    let dancer: DanceAnimator | undefined
    let danceId: string | undefined
    let floor = 0
    const behavior = new PetBehaviorController()
    const face = new PetExpressionController()
    let lastBehavior: PetBehavior = 'idle'
    let disposed = false
    let frame = 0
    let last = 0
    let elapsed = 0
    let pointerX = 0
    let pointerY = 0
    let targetX = 0
    let targetY = 0
    let targetYaw = -0.12
    let zoom = 1
    let modelWidth = 1.1
    let blinkStarted = -10
    let nextBlink = 2.5
    let presented = false
    let dragging = false
    let moved = false
    let downX = 0
    let downY = 0
    let downYaw = 0
    let rotatingDrag = false
    let touchRegion: 'head' | 'body' | undefined
    const raycaster = new THREE.Raycaster()
    const touchPoint = new THREE.Vector2()
    const gazeRotation = new THREE.Quaternion()
    const inverseGaze = new THREE.Quaternion()
    const expressionValues = Object.fromEntries(faceChannels.map((name) => [name, 0])) as Record<FaceChannel, number>
    let expressionBindings = new Map<FaceChannel, string>()
    let faceTilt = 0
    let facePitch = 0
    const pose = (name: VRMHumanBoneName, x: number, y: number, z: number): void => {
      vrm?.humanoid.getNormalizedBoneNode(name)?.rotation.set(x, y, z)
    }

    const resize = (): void => {
      const width = Math.max(host.clientWidth, 1)
      const height = Math.max(host.clientHeight, 1)
      renderer.setSize(width, height, false)
      canvas.width = renderer.domElement.width
      canvas.height = renderer.domElement.height
      const aspect = width / height
      const viewHeight = (portraitRef.current ? 0.92 : Math.max(1.9, modelWidth / aspect * 1.12)) / zoom
      const centerY = portraitRef.current ? 1.24 : 0.84
      camera.position.y = centerY
      camera.lookAt(0, centerY, 0)
      camera.left = -viewHeight * aspect / 2
      camera.right = viewHeight * aspect / 2
      camera.top = viewHeight / 2
      camera.bottom = -viewHeight / 2
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    let assetFailed = false
    const manager = new THREE.LoadingManager()
    manager.onError = () => { assetFailed = true }
    const loader = new GLTFLoader(manager)
    loader.register((parser) => new VRMLoaderPlugin(parser))
    loader.load(modelUrl, (gltf) => {
      const loaded = gltf.userData.vrm as VRM | undefined
      if (!loaded || assetFailed) {
        VRMUtils.deepDispose(gltf.scene)
        if (!disposed) setState('error')
        return
      }
      if (disposed) { VRMUtils.deepDispose(loaded.scene); return }
      vrm = loaded
      VRMUtils.rotateVRM0(loaded)
      pose('leftUpperArm', 0, 0, 1.18)
      pose('rightUpperArm', 0, 0, -1.18)
      pose('leftLowerArm', 0, -0.12, 0.08)
      pose('rightLowerArm', 0, 0.12, -0.08)
      loaded.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.frustumCulled = false
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => {
          if ('outlineWidthFactor' in material && typeof material.outlineWidthFactor === 'number') material.outlineWidthFactor *= 0.7
          if ('map' in material && material.map instanceof THREE.Texture) {
            material.map.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8)
          }
        })
      })
      loaded.update(0)
      loaded.scene.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(loaded.scene)
      const size = bounds.getSize(new THREE.Vector3())
      const center = bounds.getCenter(new THREE.Vector3())
      const scale = 1.6 / size.y
      loaded.scene.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z))
      root.scale.setScalar(scale)
      root.add(loaded.scene)
      scene.updateMatrixWorld(true)
      loaded.springBoneManager?.reset()
      modelWidth = size.x * scale
      if (loaded.lookAt) {
        loaded.lookAt.target = lookTarget
        loaded.lookAt.autoUpdate = true
      }
      host.dataset.avatar = 'zome'
      expressionBindings = bindPetExpressions(loaded)
      host.dataset.expressionChannels = [...expressionBindings.keys()].join(',')
      animator = new PetAnimator(loaded)
      dancer = new DanceAnimator(loaded)
      floor = Math.min(...['leftFoot', 'rightFoot'].map(name => loaded.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName)?.getWorldPosition(new THREE.Vector3()).y ?? 0))
      behavior.interact('greet', elapsed)
      resize()
      setProgress(100)
    }, (event) => {
      if (!disposed && event.total > 0) setProgress(Math.min(99, Math.round(event.loaded / event.total * 100)))
    }, (error) => {
      if (!disposed) {
        console.error('Zome avatar failed to load', error)
        setState('error')
      }
    })

    const pointerMove = (event: PointerEvent): void => {
      const bounds = host.getBoundingClientRect()
      targetX = THREE.MathUtils.clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1)
      targetY = THREE.MathUtils.clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1)
      if (dragging) {
        const difference = event.screenX - downX
        if (!moved && Math.hypot(difference, event.screenY - downY) > 5) {
          moved = true
          if (!rotatingDrag && !danceRef.current.playback) behavior.interact('lifted', elapsed)
        }
        if (rotatingDrag) targetYaw = THREE.MathUtils.clamp(downYaw + difference * 0.009, -0.8, 0.8)
        else if (moved) void platformApi.moveWindowDrag(event.screenX, event.screenY)
      }
    }
    const pointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || !interactionRef.current.draggable || (event.target instanceof Element && event.target.closest('button'))) return
      dragging = true
      moved = false
      downX = event.screenX
      downY = event.screenY
      downYaw = targetYaw
      rotatingDrag = interactionRef.current.rotating
      touchRegion = undefined
      if (vrm) {
        const bounds = host.getBoundingClientRect()
        touchPoint.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2)
        raycaster.setFromCamera(touchPoint, camera)
        const hit = raycaster.intersectObject(vrm.scene, true)[0]
        const head = vrm.humanoid.getNormalizedBoneNode('head')?.getWorldPosition(new THREE.Vector3())
        if (hit) touchRegion = head && hit.point.y >= head.y - 0.08 ? 'head' : 'body'
      }
      if (!rotatingDrag) void platformApi.startWindowDrag(event.screenX, event.screenY)
      host.setPointerCapture(event.pointerId)
      host.style.cursor = 'grabbing'
    }
    const pointerUp = (event: PointerEvent): void => {
      if (!dragging) return
      dragging = false
      if (!rotatingDrag) void platformApi.endWindowDrag()
      host.style.cursor = ''
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId)
      if (!rotatingDrag) {
        if (moved) behavior.interact('land', elapsed)
        else if (touchRegion && !danceRef.current.playback) behavior.interact(touchRegion === 'head' ? 'pat' : 'greet', elapsed)
      }
    }
    const pointerCancel = (): void => {
      if (dragging && moved && !rotatingDrag) behavior.interact('land', elapsed)
      dragging = false
      host.style.cursor = ''
      void platformApi.endWindowDrag()
    }
    const pointerLeave = (): void => { if (!dragging) { targetX = 0; targetY = 0 } }
    const wheel = (event: WheelEvent): void => {
      event.preventDefault()
      zoom = THREE.MathUtils.clamp(zoom - event.deltaY * 0.0005, 0.85, 1.08)
      resize()
    }
    const reset = (): void => { targetYaw = -0.12; zoom = 1; resize() }
    resetViewRef.current = reset
    host.addEventListener('pointermove', pointerMove)
    host.addEventListener('pointerdown', pointerDown)
    host.addEventListener('pointerup', pointerUp)
    host.addEventListener('pointercancel', pointerCancel)
    host.addEventListener('lostpointercapture', pointerCancel)
    window.addEventListener('blur', pointerCancel)
    host.addEventListener('pointerleave', pointerLeave)
    host.addEventListener('wheel', wheel, { passive: false })
    host.addEventListener('dblclick', reset)

    let lastAction = 0
    let lastCue = 0
    let actionUntil = 0
    let agentBehavior: PetBehavior = 'idle'
    const animate = (now: number): void => {
      if (disposed) return
      frame = requestAnimationFrame(animate)
      if (last && now - last < 1000 / 30) return
      const delta = last ? Math.min((now - last) / 1000, 0.05) : 1 / 30
      last = now
      elapsed += delta
      if (!vrm || !context) return
      const smoothing = 1 - Math.exp(-delta * 7)
      pointerX = THREE.MathUtils.lerp(pointerX, targetX, smoothing)
      pointerY = THREE.MathUtils.lerp(pointerY, targetY, smoothing)
      root.rotation.y = THREE.MathUtils.lerp(root.rotation.y, targetYaw, smoothing)
      host.dataset.yaw = root.rotation.y.toFixed(3)
      lookTarget.position.set(pointerX * 0.8, 1.4 - pointerY * 0.5, 3)
      const external = agentRef.current
      const cue = cueRef.current
      if (cue && cue.id !== lastCue && !dragging && behavior.current !== 'lifted') {
        lastCue = cue.id
        behavior.interact(cue.name, elapsed)
        animator?.restart(); face.restart()
      }
      const localBehavior = behavior.update(moodRef.current, elapsed, !reducedMotion && !external.controller && !activityRef.current && !danceRef.current.playback)
      if (!external.controller || external.task?.status === 'cancelled') { actionUntil = 0; agentBehavior = 'idle' }
      else if (external.action && external.action.id !== lastAction && localBehavior === 'idle') {
        lastAction = external.action.id
        agentBehavior = external.action.name
        actionUntil = elapsed + behaviorDuration[agentBehavior]
      }
      const taskPose = external.task?.status === 'working' ? 'working' : external.task?.status === 'waiting' ? 'waiting' : 'idle'
      const currentBehavior = localBehavior !== 'idle' ? localBehavior : elapsed < actionUntil ? agentBehavior : taskPose !== 'idle' ? taskPose : activityRef.current ?? 'idle'
      host.dataset.behavior = currentBehavior
      if (currentBehavior !== lastBehavior) {
        lastBehavior = currentBehavior
        behaviorListener.current(currentBehavior)
      }
      const head = vrm.humanoid.getNormalizedBoneNode('head')
      // Remove the previous additive gaze before the mixer reapplies its cached pose.
      if (head) head.quaternion.multiply(inverseGaze.copy(gazeRotation).invert())
      if (!dancer?.active) animator?.update(currentBehavior, delta, reducedMotion)
      const dance = danceRef.current
      if (dance.asset?.entry.id !== danceId) {
        danceId = dance.asset?.entry.id
        dancer?.stop()
        if (dance.asset) void dancer?.load(dance.asset).catch((error) => {
          console.error('Dance playback failed', error)
          void platformApi.controlDance({ action: 'stop' })
        })
      }
      const danceTime = dance.playback && dance.asset ? dancePosition(dance.playback, dance.asset.entry.duration) : 0
      const dancing = dancer?.update(danceTime, delta) ?? false
      host.dataset.danceId = dancing ? danceId : ''
      host.dataset.danceTime = danceTime.toFixed(3)
      host.dataset.dancePose = dancing ? vrm.humanoid.getNormalizedBoneNode('leftUpperArm')?.quaternion.toArray().map(n => n.toFixed(4)).join(',') : ''
      const conversation = performanceRef.current && performanceRef.current.expiresAt > Date.now() ? performanceRef.current : undefined
      const stage = dancing && dance.playback && dance.asset ? danceExpressionAt(danceTime, dance.asset.entry.duration, dance.playback.expressionStyle, dance.asset.motion?.expressions) : undefined
      const directTouch = ['pat', 'lifted', 'land'].includes(currentBehavior)
      const directive = directTouch ? undefined : conversation ?? stage
      const expression = applyPerformanceFace(face.update(moodRef.current, currentBehavior, elapsed, mouthRef.current, reducedMotion), directive, mouthRef.current, reducedMotion)
      host.dataset.emotion = directive?.emotion ?? ''
      host.dataset.emotionSource = directive ? conversation ? conversation.source : 'dance' : ''
      faceTilt = THREE.MathUtils.lerp(faceTilt, expression.headTilt, smoothing)
      facePitch = THREE.MathUtils.lerp(facePitch, expression.headPitch, smoothing)
      gazeRotation.setFromEuler(new THREE.Euler(-pointerY * 0.04 + facePitch, pointerX * 0.07, faceTilt))
      if (dancing) gazeRotation.identity()
      if (head) head.quaternion.multiply(gazeRotation)
      root.position.y = THREE.MathUtils.lerp(root.position.y, !reducedMotion && currentBehavior === 'lifted' ? 0.035 : 0, smoothing)
      if (elapsed > nextBlink) { blinkStarted = elapsed; nextBlink = elapsed + 3 + Math.random() * 3 }
      const blinkTime = (elapsed - blinkStarted) / 0.18
      const blink = blinkTime >= 0 && blinkTime <= 1 ? Math.sin(blinkTime * Math.PI) ** 2 : 0
      for (const channel of faceChannels) {
        expressionValues[channel] = THREE.MathUtils.lerp(expressionValues[channel], expression.weights[channel], smoothing)
        const name = expressionBindings.get(channel)
        if (name) vrm.expressionManager?.setValue(name, expressionValues[channel])
      }
      host.dataset.expression = expression.name
      host.dataset.emote = Math.max(expressionValues.heart, expressionValues.star, expressionValues.wink).toFixed(3)
      host.dataset.mouth = expressionValues.aa.toFixed(3)
      host.dataset.blush = expressionValues.blush.toFixed(3)
      host.dataset.sad = expressionValues.sad.toFixed(3)
      vrm.expressionManager?.setValue('blink', blink * (1 - expressionValues.wink))
      vrm.update(delta)
      host.dataset.gesturePose = ['head', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm'].map(name => vrm!.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName)?.quaternion.toArray().map(n => n.toFixed(3)).join(',') ?? '').join(';')
      if (dancing && dance.asset?.motion) {
        scene.updateMatrixWorld(true)
        const footY = Math.min(...['leftFoot', 'rightFoot'].map(name => vrm!.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName)?.getWorldPosition(new THREE.Vector3()).y ?? floor))
        const correction = THREE.MathUtils.clamp(floor - (footY - root.position.y), -.25, .25)
        root.position.y = THREE.MathUtils.lerp(root.position.y, correction, 1 - Math.exp(-delta * 18))
      }
      if (dancing) host.dataset.danceHand = vrm.humanoid.getNormalizedBoneNode('leftHand')?.getWorldPosition(new THREE.Vector3()).toArray().map(n => n.toFixed(3)).join(',') ?? ''
      renderer.render(scene, camera)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(renderer.domElement, 0, 0)
      if (!presented) { presented = true; setState('ready') }
    }
    frame = requestAnimationFrame(animate)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      host.removeEventListener('pointermove', pointerMove)
      host.removeEventListener('pointerdown', pointerDown)
      host.removeEventListener('pointerup', pointerUp)
      host.removeEventListener('pointercancel', pointerCancel)
      host.removeEventListener('lostpointercapture', pointerCancel)
      window.removeEventListener('blur', pointerCancel)
      host.removeEventListener('pointerleave', pointerLeave)
      host.removeEventListener('wheel', wheel)
      host.removeEventListener('dblclick', reset)
      animator?.dispose()
      dancer?.dispose()
      VRMUtils.deepDispose(scene)
      renderer.dispose()
      renderer.forceContextLoss()
      resetViewRef.current = null
      void platformApi.endWindowDrag()
    }
  }, [attempt])

  useEffect(() => { resetViewRef.current?.() }, [portrait, viewReset])

  return (
    <div ref={hostRef} className={'three-pet-host three-pet-' + state} data-3d-ready={state === 'ready'} data-mood={mood} data-view={portrait ? 'portrait' : 'full'} data-interaction={rotating ? 'rotate' : 'move'}>
      <canvas ref={canvasRef} className="three-pet-canvas" aria-label="Zome 3D 桌宠" />
      {state === 'loading' && <div className="three-pet-loading" role="status"><span className="avatar-spinner" /><span>{progress}%</span></div>}
      {state === 'error' && <div className="avatar-error" role="alert"><span>角色加载失败</span><button className="icon-button" title="重新加载角色" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16} /></button></div>}
    </div>
  )
}
