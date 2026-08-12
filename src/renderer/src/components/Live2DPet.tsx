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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modelRef = useRef<Live2DModel | null>(null)
  const moodRef = useRef<PetMood>(mood)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  moodRef.current = mood

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    window.PIXI = PIXI
    let app: PIXI.Application | null = null
    let disposed = false
    let observer: ResizeObserver | undefined

    try {
      app = new PIXI.Application({
        view: canvas,
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio, 2)
      })
    } catch (error) {
      console.error('Live2D renderer is unavailable', error)
      setState('error')
      return
    }

    const pixiApp = app

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
      observer = new ResizeObserver(() => placeModel(model))
      observer.observe(host)
      setState('ready')
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
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('pointerdown', handlePointerDown)

    return () => {
      disposed = true
      observer?.disconnect()
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('pointerdown', handlePointerDown)
      modelRef.current = null
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
      <canvas ref={canvasRef} className="live2d-canvas" aria-label="Live2D 财仔" />
      {state === 'loading' && <div className="live2d-loading">财仔正在梳头发...</div>}
      {state === 'error' && <div className="live2d-error"><strong>财仔暂时睡着了</strong><span>请检查显卡加速后再叫醒她</span></div>}
    </div>
  )
}
