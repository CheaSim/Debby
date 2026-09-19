import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { PetMood } from '../../../shared/types'

interface ThreeDPetProps {
  mood: PetMood
}

type PetPalette = {
  body: number
  bodyLight: number
  accent: number
  accentLight: number
  cheek: number
  chart: number
}

const palettes: Record<PetMood, PetPalette> = {
  idle: { body: 0xf3d7df, bodyLight: 0xfff5f6, accent: 0xd45e7d, accentLight: 0xffd2de, cheek: 0xf29bac, chart: 0xf0b84c },
  bullish: { body: 0xd6eee1, bodyLight: 0xf5fff9, accent: 0x2f9b75, accentLight: 0xb9ead5, cheek: 0x7bc6a6, chart: 0xf0b84c },
  bearish: { body: 0xd9e2ef, bodyLight: 0xf5f8ff, accent: 0x6684a7, accentLight: 0xc9d7ea, cheek: 0x9eb8d4, chart: 0x8ba2bd },
  alert: { body: 0xffe0bf, bodyLight: 0xfff9ed, accent: 0xd36a45, accentLight: 0xffc2a4, cheek: 0xef9a79, chart: 0xe46d72 },
  offline: { body: 0xdcd9e4, bodyLight: 0xf8f6fb, accent: 0x8f849e, accentLight: 0xd7cfdd, cheek: 0xb9aabf, chart: 0xa39aaa }
}

const material = (color: number, roughness = 0.72, metalness = 0.02): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness })

function addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, position: THREE.Vector3, scale?: THREE.Vector3): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, mat)
  mesh.position.copy(position)
  if (scale) mesh.scale.copy(scale)
  parent.add(mesh)
  return mesh
}

function buildPet(palette: PetPalette): {
  root: THREE.Group
  eyes: THREE.Mesh[]
  pupils: THREE.Mesh[]
  materials: THREE.Material[]
  colorMaterials: { body: THREE.MeshStandardMaterial; bodyLight: THREE.MeshStandardMaterial; accent: THREE.MeshStandardMaterial; accentLight: THREE.MeshStandardMaterial; cheek: THREE.MeshStandardMaterial; chart: THREE.MeshStandardMaterial }
} {
  const root = new THREE.Group()
  const character = new THREE.Group()
  root.add(character)
  const materials: THREE.Material[] = []
  const use = (mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => {
    materials.push(mat)
    return mat
  }

  const bodyMat = use(material(palette.body))
  const bodyLightMat = use(material(palette.bodyLight, 0.62))
  const accentMat = use(material(palette.accent, 0.62))
  const accentLightMat = use(material(palette.accentLight, 0.64))
  const darkMat = use(material(0x302a32, 0.46))
  const whiteMat = use(material(0xffffff, 0.4))
  const chartMat = use(material(palette.chart, 0.58, 0.06))
  const cheekMat = use(new THREE.MeshStandardMaterial({ color: palette.cheek, transparent: true, opacity: 0.72, roughness: 0.7 }))

  const tail = addMesh(character, new THREE.SphereGeometry(0.34, 18, 12), bodyMat, new THREE.Vector3(-0.57, 0.48, -0.22), new THREE.Vector3(0.9, 0.9, 0.52))
  tail.rotation.z = -0.55
  const body = addMesh(character, new THREE.CapsuleGeometry(0.53, 0.62, 8, 16), bodyMat, new THREE.Vector3(0, 0.48, 0))
  body.scale.set(0.9, 0.98, 0.72)
  const bib = addMesh(character, new THREE.SphereGeometry(0.36, 18, 14), bodyLightMat, new THREE.Vector3(0, 0.49, 0.37), new THREE.Vector3(1.03, 1.15, 0.38))
  bib.rotation.x = 0.15
  addMesh(character, new THREE.SphereGeometry(0.15, 14, 10), accentLightMat, new THREE.Vector3(0, 0.63, 0.54), new THREE.Vector3(1, 0.82, 0.32))

  const head = new THREE.Group()
  head.position.set(0, 1.18, 0)
  character.add(head)
  addMesh(head, new THREE.SphereGeometry(0.78, 24, 18), bodyLightMat, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0.94, 0.88))
  const hair = addMesh(head, new THREE.SphereGeometry(0.76, 24, 14), bodyMat, new THREE.Vector3(0, 0.12, -0.08), new THREE.Vector3(1.02, 0.78, 0.92))
  hair.rotation.x = -0.12

  const earGeo = new THREE.ConeGeometry(0.22, 0.48, 8)
  const innerEarGeo = new THREE.ConeGeometry(0.12, 0.28, 8)
  for (const side of [-1, 1]) {
    const ear = addMesh(head, earGeo, bodyMat, new THREE.Vector3(side * 0.48, 0.57, -0.03), new THREE.Vector3(1, 1, 0.8))
    ear.rotation.z = side * -0.32
    const inner = addMesh(head, innerEarGeo, accentLightMat, new THREE.Vector3(side * 0.48, 0.58, 0.12), new THREE.Vector3(1, 1, 0.7))
    inner.rotation.z = side * -0.32
  }

  const eyes: THREE.Mesh[] = []
  const pupils: THREE.Mesh[] = []
  for (const side of [-1, 1]) {
    const eye = addMesh(head, new THREE.SphereGeometry(0.115, 16, 12), darkMat, new THREE.Vector3(side * 0.27, 0.03, 0.69), new THREE.Vector3(0.86, 1.2, 0.5))
    const pupil = addMesh(head, new THREE.SphereGeometry(0.052, 12, 10), whiteMat, new THREE.Vector3(side * 0.235, 0.075, 0.756), new THREE.Vector3(0.7, 0.95, 0.35))
    eyes.push(eye)
    pupils.push(pupil)
    addMesh(head, new THREE.SphereGeometry(0.13, 14, 10), cheekMat, new THREE.Vector3(side * 0.43, -0.16, 0.61), new THREE.Vector3(1.15, 0.48, 0.3))
  }
  const mouth = addMesh(head, new THREE.TorusGeometry(0.085, 0.018, 8, 16, Math.PI), darkMat, new THREE.Vector3(0, -0.2, 0.7))
  mouth.rotation.x = Math.PI
  mouth.rotation.z = Math.PI

  const armGeo = new THREE.CapsuleGeometry(0.105, 0.3, 6, 10)
  for (const side of [-1, 1]) {
    const arm = addMesh(character, armGeo, accentMat, new THREE.Vector3(side * 0.52, 0.49, 0.02), new THREE.Vector3(1, 1, 0.82))
    arm.rotation.z = side * -0.44
  }
  const footGeo = new THREE.SphereGeometry(0.22, 16, 10)
  addMesh(character, footGeo, accentMat, new THREE.Vector3(-0.28, 0.04, 0.16), new THREE.Vector3(1.1, 0.5, 1.25))
  addMesh(character, footGeo, accentMat, new THREE.Vector3(0.28, 0.04, 0.16), new THREE.Vector3(1.1, 0.5, 1.25))

  const badge = new THREE.Group()
  badge.position.set(0, 0.54, 0.62)
  badge.rotation.x = -Math.PI / 2
  character.add(badge)
  addMesh(badge, new THREE.CylinderGeometry(0.19, 0.19, 0.045, 8), chartMat, new THREE.Vector3(0, 0, 0))
  addMesh(badge, new THREE.RingGeometry(0.12, 0.145, 8), whiteMat, new THREE.Vector3(0, 0.026, 0))
  const barGeo = new THREE.BoxGeometry(0.035, 0.13, 0.018)
  addMesh(badge, barGeo, accentMat, new THREE.Vector3(-0.065, 0.05, 0.028), new THREE.Vector3(1, 0.55, 1))
  addMesh(badge, barGeo, accentMat, new THREE.Vector3(0, 0.08, 0.028), new THREE.Vector3(1, 0.9, 1))
  addMesh(badge, barGeo, accentMat, new THREE.Vector3(0.065, 0.12, 0.028), new THREE.Vector3(1, 1.35, 1))

  const orbit = new THREE.Group()
  orbit.position.set(0, 1.06, 0)
  root.add(orbit)
  const coinMat = use(material(palette.chart, 0.5, 0.12))
  const coin = addMesh(orbit, new THREE.CylinderGeometry(0.105, 0.105, 0.035, 16), coinMat, new THREE.Vector3(0.92, 0.2, -0.08))
  coin.rotation.x = Math.PI / 2
  const sparkle = addMesh(orbit, new THREE.OctahedronGeometry(0.085, 0), accentLightMat, new THREE.Vector3(-0.84, 0.34, -0.05))
  sparkle.rotation.z = 0.3

  return {
    root,
    eyes,
    pupils,
    materials,
    colorMaterials: { body: bodyMat, bodyLight: bodyLightMat, accent: accentMat, accentLight: accentLightMat, cheek: cheekMat, chart: chartMat }
  }
}

export function ThreeDPet({ mood }: ThreeDPetProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const petRef = useRef<ReturnType<typeof buildPet> | null>(null)
  const moodRef = useRef<PetMood>(mood)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  moodRef.current = mood

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.08
    } catch (error) {
      console.error('3D renderer is unavailable', error)
      setState('error')
      return
    }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 100)
    camera.position.set(0, 1.05, 5.8)
    camera.lookAt(0, 0.9, 0)
    scene.add(new THREE.HemisphereLight(0xfff7fb, 0x9aabb8, 2.1))
    const key = new THREE.DirectionalLight(0xffffff, 3.2)
    key.position.set(2.5, 4.5, 5)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xf3b3c4, 1.7)
    rim.position.set(-3, 2.4, -1)
    scene.add(rim)

    const pet = buildPet(palettes[moodRef.current])
    petRef.current = pet
    scene.add(pet.root)
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.74, 32),
      new THREE.MeshBasicMaterial({ color: 0x483c46, transparent: true, opacity: 0.16, depthWrite: false })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, -0.03, 0.12)
    ground.scale.set(1.1, 0.42, 1)
    scene.add(ground)

    let frame = 0
    let disposed = false
    let pointerX = 0
    let pointerY = 0
    let targetPointerX = 0
    let targetPointerY = 0
    let last = performance.now()
    let blinkAt = last + 2600
    let blinkStart = 0
    let jumpOffset = 0
    let jumpVelocity = 0
    const resize = (): void => {
      const width = Math.max(host.clientWidth, 1)
      const height = Math.max(host.clientHeight, 1)
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()
    setState('ready')

    const handlePointerMove = (event: PointerEvent): void => {
      const rect = host.getBoundingClientRect()
      targetPointerX = THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1)
      targetPointerY = THREE.MathUtils.clamp((event.clientY - rect.top) / rect.height * 2 - 1, -1, 1)
    }
    const handlePointerLeave = (): void => { targetPointerX = 0; targetPointerY = 0 }
    const handlePointerDown = (): void => { jumpVelocity = 0.115 }
    host.addEventListener('pointermove', handlePointerMove)
    host.addEventListener('pointerleave', handlePointerLeave)
    host.addEventListener('pointerdown', handlePointerDown)

    const animate = (now: number): void => {
      if (disposed) return
      frame = window.requestAnimationFrame(animate)
      const elapsed = Math.min((now - last) / 1000, 0.05)
      last = now
      const t = now / 1000
      pointerX = THREE.MathUtils.lerp(pointerX, targetPointerX, 0.07)
      pointerY = THREE.MathUtils.lerp(pointerY, targetPointerY, 0.07)
      jumpVelocity -= elapsed * 0.32
      jumpOffset += jumpVelocity
      if (jumpOffset < 0) { jumpOffset = 0; jumpVelocity = 0 }
      const moodScale = moodRef.current === 'alert' ? 1 + Math.sin(t * 8) * 0.015 : 1
      pet.root.position.y = Math.sin(t * 2.05) * 0.035 + jumpOffset
      pet.root.rotation.y = THREE.MathUtils.lerp(pet.root.rotation.y, pointerX * 0.13 + Math.sin(t * 0.52) * 0.05, 0.055)
      pet.root.rotation.x = THREE.MathUtils.lerp(pet.root.rotation.x, pointerY * 0.045, 0.055)
      pet.root.scale.setScalar(moodScale)
      pet.root.children[0].rotation.z = Math.sin(t * 1.2) * 0.018
      pet.pupils.forEach((pupil, index) => { pupil.position.x = (index ? 1 : -1) * 0.235 + pointerX * 0.025; pupil.position.y = 0.075 - pointerY * 0.012 })
      if (!blinkStart && now > blinkAt) blinkStart = now
      if (blinkStart) {
        const progress = (now - blinkStart) / 150
        const blink = progress < 0.5 ? progress * 2 : 2 - progress * 2
        pet.eyes.forEach((eye) => { eye.scale.y = Math.max(0.08, 1.2 * (1 - blink)) })
        if (progress >= 1) { blinkStart = 0; blinkAt = now + 1800 + Math.random() * 3600; pet.eyes.forEach((eye) => { eye.scale.y = 1.2 }) }
      }
      renderer.render(scene, camera)
    }
    frame = window.requestAnimationFrame(animate)

    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      host.removeEventListener('pointermove', handlePointerMove)
      host.removeEventListener('pointerleave', handlePointerLeave)
      host.removeEventListener('pointerdown', handlePointerDown)
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        if (Array.isArray(object.material)) object.material.forEach((item) => item.dispose())
        else object.material.dispose()
      })
      renderer.dispose()
      if (petRef.current === pet) petRef.current = null
    }
  }, [])

  useEffect(() => {
    const palette = palettes[mood]
    const host = hostRef.current
    if (!host) return
    const pet = petRef.current
    if (pet) {
      const body = new THREE.Color(palette.body)
      const bodyLight = new THREE.Color(palette.bodyLight)
      const accent = new THREE.Color(palette.accent)
      const accentLight = new THREE.Color(palette.accentLight)
      const cheek = new THREE.Color(palette.cheek)
      const chart = new THREE.Color(palette.chart)
      pet.colorMaterials.body.color.copy(body)
      pet.colorMaterials.bodyLight.color.copy(bodyLight)
      pet.colorMaterials.accent.color.copy(accent)
      pet.colorMaterials.accentLight.color.copy(accentLight)
      pet.colorMaterials.cheek.color.copy(cheek)
      pet.colorMaterials.chart.color.copy(chart)
    }
    host.dataset.mood = mood
    host.style.setProperty('--pet-accent', `#${palette.accent.toString(16).padStart(6, '0')}`)
  }, [mood])

  return (
    <div ref={hostRef} className={`three-pet-host three-pet-${state}`} data-3d-ready={state === 'ready'}>
      <canvas ref={canvasRef} className="three-pet-canvas" aria-label="财仔 3D 桌宠" />
      {state === 'loading' && <div className="three-pet-loading">财仔正在进入立体模式...</div>}
      {state === 'error' && <div className="live2d-error"><strong>3D 模式暂时睡着了</strong><span>请检查显卡加速后再叫醒她</span></div>}
    </div>
  )
}
