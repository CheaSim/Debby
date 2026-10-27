import { useEffect, useRef, useState } from 'react'
import { applyLayeredPerformance, layeredParameters, type LayeredAvatarAsset, type LayeredAvatarDriver } from '../../../shared/layered-avatar'
import type { AvatarPerformance } from '../../../shared/avatar-performance'
import type { AvatarCue } from '../../../shared/avatar'
import type { PetMood } from '../../../shared/types'
import { behaviorDuration, PetBehaviorController, type PetBehavior } from '../../../shared/pet-behavior'
import type { AgentShellState } from '../../../shared/shell'
import { createLayeredDriver } from '../avatar/layered-runtime'
import { platformApi } from '../platform-api'

interface Props {
  performance?: AvatarPerformance
  asset: LayeredAvatarAsset; portrait?: boolean; mouthLevel?: number; mood?: PetMood; cue?: AvatarCue
  activity?: 'listening' | 'talking' | 'working'; agentShell?: AgentShellState; draggable?: boolean
  onBehavior?: (behavior: PetBehavior) => void; onReady?: () => void; onError: (message: string) => void
}
/** Debby input contract in, upstream mesh rendering out. No LLM/provider/device access. */
export function LayeredPet(props: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null)
  const current = useRef(props); current.current = props
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const host = hostRef.current!, output = canvasRef.current!, source = document.createElement('canvas')
    let disposed = false, driver: LayeredAvatarDriver | undefined, frame = 0, previous = 0, lastCue = -1, lastAction = -1
    let dragging = false, moved = false, downX = 0, downY = 0, elapsed = 0, lastBehavior: PetBehavior = 'idle'
    let agentBehavior: PetBehavior = 'idle', actionUntil = 0, filtered: Record<string, number> | undefined
    const gaze = { x: 0, y: 0 }, behavior = new PetBehaviorController()
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const context = output.getContext('2d', { alpha: true })
    const gl = source.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true })
    const fail = (e: unknown): void => { if (!disposed) { setReady(false); current.current.onError(e instanceof Error ? e.message : String(e)) } }
    const resize = (): void => {
      const rect = host.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1)
      output.width = Math.max(1, Math.round(rect.width * dpr)); output.height = Math.max(1, Math.round(rect.height * dpr))
    }
    const observer = new ResizeObserver(resize); observer.observe(host); resize()
    const pointerMove = (event: PointerEvent): void => {
      const rect = host.getBoundingClientRect()
      gaze.x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1))
      gaze.y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1))
      if (!dragging) return
      if (!moved && Math.hypot(event.screenX - downX, event.screenY - downY) > 5) { moved = true; behavior.interact('lifted', elapsed) }
      if (moved) void platformApi.moveWindowDrag(event.screenX, event.screenY)
    }
    const pointerDown = (event: PointerEvent): void => {
      if (event.button || !current.current.draggable) return
      dragging = true; moved = false; downX = event.screenX; downY = event.screenY
      host.setPointerCapture(event.pointerId); void platformApi.startWindowDrag(downX, downY)
    }
    const cancelDrag = (): void => {
      if (!dragging) return
      dragging = false; void platformApi.endWindowDrag(); behavior.interact('land', elapsed)
    }
    const pointerUp = (event: PointerEvent): void => {
      if (!dragging) return
      dragging = false; void platformApi.endWindowDrag()
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId)
      behavior.interact(moved ? 'land' : 'pat', elapsed)
    }
    const leave = (): void => { if (!dragging) gaze.x = gaze.y = 0 }
    const lost = (event: Event): void => { event.preventDefault(); cancelDrag(); fail(Error('图形上下文已丢失。')) }
    host.addEventListener('pointermove', pointerMove); host.addEventListener('pointerdown', pointerDown)
    host.addEventListener('pointerup', pointerUp); host.addEventListener('pointercancel', cancelDrag)
    host.addEventListener('lostpointercapture', cancelDrag); host.addEventListener('pointerleave', leave)
    window.addEventListener('blur', cancelDrag); source.addEventListener('webglcontextlost', lost)
    const tick = (now: number): void => {
      if (disposed) return
      frame = requestAnimationFrame(tick)
      if (document.hidden || now - previous < 1000 / 30) return
      const dt = Math.min(.05, (now - (previous || now)) / 1000); previous = now; elapsed += dt
      const p = current.current, shell = p.agentShell
      if (p.cue && p.cue.id !== lastCue && !dragging) { lastCue = p.cue.id; behavior.interact(p.cue.name, elapsed) }
      let active = behavior.update(p.mood ?? 'idle', elapsed)
      if (!shell?.controller || shell.task?.status === 'cancelled') { actionUntil = 0; agentBehavior = 'idle' }
      else if (!dragging && active === 'idle' && shell.action && shell.action.id !== lastAction) {
        lastAction = shell.action.id; agentBehavior = shell.action.name; actionUntil = elapsed + behaviorDuration[agentBehavior]
      }
      if (active === 'idle' && elapsed < actionUntil) active = agentBehavior
      if (active === 'idle') active = shell?.controller && shell.task?.status === 'working' ? 'working' : shell?.controller && shell.task?.status === 'waiting' ? 'waiting' : p.activity ?? 'idle'
      const performance = p.performance && p.performance.expiresAt > Date.now() && !['pat', 'lifted', 'land'].includes(active) ? p.performance : undefined
      const target = applyLayeredPerformance(layeredParameters({ time: elapsed, mood: p.mood ?? 'idle', behavior: active, mouth: p.mouthLevel ?? 0, gaze, reducedMotion: reduced.matches }), performance, reduced.matches)
      host.dataset.emotion = performance?.emotion ?? ''; host.dataset.emotionSource = performance?.source ?? ''
      filtered ??= { ...target }
      for (const key of Object.keys(target)) filtered[key] += (target[key] - filtered[key]) * (1 - Math.exp(-dt * (key.startsWith('eyeOpen') ? 55 : 18)))
      const params = filtered
      try {
        driver!.frame(params, dt, elapsed)
        const { w, h } = p.asset.rig.canvas, face = p.asset.rig.anchors.face
        const cropW = p.portrait ? Math.min(w, (face.x1 - face.x0) * 2.25) : w
        const cropH = p.portrait ? Math.min(h, (face.y1 - face.y0) * 2.8) : h
        const sx = Math.max(0, Math.min(w - cropW, (face.x0 + face.x1 - cropW) / 2))
        const sy = p.portrait ? Math.max(0, Math.min(h - cropH, face.y0 - (face.y1 - face.y0) * .65)) : 0
        const scale = Math.min(output.width / cropW, output.height / cropH), dw = cropW * scale, dh = cropH * scale
        context!.clearRect(0, 0, output.width, output.height)
        context!.drawImage(source, sx, sy, cropW, cropH, (output.width - dw) / 2, output.height - dh, dw, dh)
        host.dataset.behavior = active; host.dataset.mouth = params.mouthOpen.toFixed(3); host.dataset.pose = params.angleY.toFixed(3) + ':' + params.angleX.toFixed(3)
        if (active !== lastBehavior) { lastBehavior = active; p.onBehavior?.(active) }
      } catch (e) { cancelAnimationFrame(frame); fail(e) }
    }
    setReady(false)
    void (async () => {
      if (!gl || !context) throw Error('这台设备无法创建透明角色画布。')
      source.width = props.asset.rig.canvas.w; source.height = props.asset.rig.canvas.h
      driver = await createLayeredDriver(gl, props.asset.rig)
      if (disposed) { driver.dispose(); gl.getExtension('WEBGL_lose_context')?.loseContext(); return }
      driver.frame(layeredParameters({ time: 1, mood: 'idle', behavior: 'idle', mouth: 0, gaze }), 0, 1)
      // Verify that the rig actually produces visible pixels before enabling Apply.
      const pixel = new Uint8Array(source.width * source.height * 4)
      gl.readPixels(0, 0, source.width, source.height, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
      if (!pixel.some((n, i) => i % 4 === 3 && n > 10)) throw Error('PSD 没有生成可见角色，请检查图层内容。')
      setReady(true); current.current.onReady?.(); frame = requestAnimationFrame(tick)
    })().catch(fail)
    return () => {
      disposed = true; cancelAnimationFrame(frame); cancelDrag(); observer.disconnect()
      host.removeEventListener('pointermove', pointerMove); host.removeEventListener('pointerdown', pointerDown)
      host.removeEventListener('pointerup', pointerUp); host.removeEventListener('pointercancel', cancelDrag)
      host.removeEventListener('lostpointercapture', cancelDrag); host.removeEventListener('pointerleave', leave)
      window.removeEventListener('blur', cancelDrag); source.removeEventListener('webglcontextlost', lost)
      driver?.dispose(); gl?.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [props.asset])
  return <div ref={hostRef} className="layered-pet-host" data-layered-ready={ready} data-mood={props.mood ?? 'idle'} data-view={props.portrait ? 'portrait' : 'full'} aria-label={`${props.asset.name} · 2.5D 角色`}>
    <canvas ref={canvasRef} className="layered-pet-canvas" />
    {!ready && <span className="layered-loading">正在唤醒角色…</span>}
  </div>
}
