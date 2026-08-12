import { useEffect, useRef, useState } from 'react'
import { install } from '@pixi/unsafe-eval'
import * as PIXI from 'pixi.js'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import type { PetMood } from '../../../shared/types'

install({ ShaderSystem: PIXI.ShaderSystem })

declare global {
  interface Window {
    PIXI: typeof PIXI
  }
}

const expressionForMood: Record<PetMood, string> = {
  idle: 'F01',
  bullish: 'F05',
  bearish: 'F04',
  alert: 'F06',
  offline: 'F08'
}

interface Live2DPetProps {
  mood: PetMood
}

export function Live2DPet({ mood }: Live2DPetProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLImageElement>(null)
  const modelRef = useRef<Live2DModel | null>(null)
  const moodRef = useRef<PetMood>(mood)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  moodRef.current = mood

  useEffect(() => {
    const host = hostRef.current
    const frame = frameRef.current
    if (!host || !frame) return

    window.PIXI = PIXI
    const renderCanvas = document.createElement('canvas')
    let app: PIXI.Application | null = null
    let disposed = false
    let animationFrame = 0
    let framePending = false
    let frameUrl: string | null = null
    let firstFramePresented = false
    let observer: ResizeObserver | undefined

    try {
      app = new PIXI.Application({
        view: renderCanvas,
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        preserveDrawingBuffer: true,
        resolution: Math.min(window.devicePixelRatio, 2)
      })
    } catch (error) {
      console.error('Live2D renderer is unavailable', error)
      setState('error')
      return
    }

    const pixiApp = app
    const frameTexture = PIXI.RenderTexture.create({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      resolution: 1.5
    })
    let lastCopiedAt = 0

    const copyFrame = (timestamp: number): void => {
      if (disposed) return
      animationFrame = window.requestAnimationFrame(copyFrame)
      if (!modelRef.current || timestamp - lastCopiedAt < 80 || framePending) return
      lastCopiedAt = timestamp
      pixiApp.renderer.render(pixiApp.stage, { renderTexture: frameTexture, clear: true })
      const extractedFrame = pixiApp.renderer.plugins.extract.canvas(frameTexture)
      if (!firstFramePresented) {
        const context = extractedFrame.getContext('2d')
        const pixels = context?.getImageData(0, 0, extractedFrame.width, extractedFrame.height).data
        let hasVisiblePixel = false
        if (pixels) {
          for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index] > 8) {
              hasVisiblePixel = true
              break
            }
          }
        }
        if (!hasVisiblePixel) return
      }
      framePending = true
      extractedFrame.toBlob((blob: Blob | null) => {
        framePending = false
        if (disposed || !blob) return
        const nextUrl = URL.createObjectURL(blob)
        const previousUrl = frameUrl
        frameUrl = nextUrl
        frame.onload = () => {
          if (!firstFramePresented) {
            firstFramePresented = true
            setState('ready')
          }
        }
        frame.src = nextUrl
        if (previousUrl) URL.revokeObjectURL(previousUrl)
      }, 'image/webp', 0.92)
    }
    animationFrame = window.requestAnimationFrame(copyFrame)

    const placeModel = (model: Live2DModel): void => {
      const width = host.clientWidth
      const height = host.clientHeight
      model.anchor.set(0.5, 0.5)
      model.scale.set(1)
      const compact = width > 260
      const scale = Math.min((width * (compact ? 1.58 : 1.42)) / model.width, (height * (compact ? 1.66 : 1.5)) / model.height)
      model.scale.set(scale)
      model.position.set(width * 0.5, height * (compact ? 0.69 : 0.67))
    }

    void Live2DModel.from(new URL('live2d/haru/Haru.model3.json', window.location.href).href, {
      autoInteract: false
    }).then((model) => {
      if (disposed) {
        model.destroy()
        return
      }
      modelRef.current = model
      pixiApp.stage.addChild(model)
      placeModel(model)
      void model.expression(expressionForMood[moodRef.current])
      observer = new ResizeObserver(() => {
        frameTexture.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight), true)
        placeModel(model)
      })
      observer.observe(host)
    }).catch((error: unknown) => {
      console.error('Live2D model failed to load', error)
      setState('error')
    })

    const handlePointerMove = (event: PointerEvent): void => {
      modelRef.current?.focus(event.clientX, event.clientY)
    }
    const handlePointerDown = (): void => {
      void modelRef.current?.motion('TapBody')
    }
    host.addEventListener('pointermove', handlePointerMove)
    host.addEventListener('pointerdown', handlePointerDown)

    return () => {
      disposed = true
      window.cancelAnimationFrame(animationFrame)
      if (frameUrl) URL.revokeObjectURL(frameUrl)
      observer?.disconnect()
      host.removeEventListener('pointermove', handlePointerMove)
      host.removeEventListener('pointerdown', handlePointerDown)
      modelRef.current = null
      frameTexture.destroy(true)
      pixiApp.destroy(false, { children: true, texture: true, baseTexture: true })
    }
  }, [])

  useEffect(() => {
    const model = modelRef.current
    if (!model) return
    void model.expression(expressionForMood[mood])
    if (mood === 'bullish' || mood === 'alert') void model.motion('TapBody')
  }, [mood])

  return (
    <div ref={hostRef} className={`live2d-host live2d-${state}`} data-live2d-ready={state === 'ready'}>
      <img ref={frameRef} className="live2d-frame" draggable={false} alt="" />
      {state === 'loading' && <div className="live2d-loading">财仔正在梳头发...</div>}
      {state === 'error' && <div className="live2d-error"><strong>财仔暂时睡着了</strong><span>请检查显卡加速后再叫醒她</span></div>}
    </div>
  )
}
