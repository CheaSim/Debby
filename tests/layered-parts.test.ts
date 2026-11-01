import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { layeredPartLabel } from '../src/shared/layered-parts'

describe('semantic part compatibility', () => {
  it('binds real See-through anatomical suffixes to spatial eye anchors, masks and facial roles', () => {
    const ctx = vm.createContext({ Uint8ClampedArray, Uint8Array, Int32Array, Float32Array })
    for (const name of ['rigger.js', 'debby-parts.js']) vm.runInContext(readFileSync(new URL('../src/renderer/public/vendor/anime25d/' + name, import.meta.url), 'utf8'), ctx)
    const layer = (name: string, left: number, top: number, width: number, height: number) => ({ name, left, top, imageData: { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) } })
    const psd = { width: 128, height: 128, children: [layer('face', 20, 10, 90, 90), layer('eyewhite-r', 30, 40, 12, 10), layer('eyewhite-l', 80, 40, 12, 10), layer('irides-r', 32, 40, 8, 10), layer('irides-l', 82, 40, 8, 10), layer('eyebrow-r', 29, 31, 14, 4), layer('eyebrow-l', 79, 31, 14, 4)] }
    const rig = ctx.Rigger.buildRig(ctx.DebbyParts.normalizeLayerNames(psd))
    expect(rig.anchors.eyeL).toBeDefined(); expect(rig.anchors.eyeR).toBeDefined()
    expect(rig.layers.filter((l: { name: string; side: string }) => l.name.startsWith('irides') && l.side)).toHaveLength(2)
    expect(rig.warnings.some((w: string) => w.includes('未知'))).toBe(false)
  })
  it('leaves arbitrary custom names intact and gives independent parts readable labels', () => {
    expect(layeredPartLabel('irides_l')).toBe('虹膜 · 左侧')
    expect(layeredPartLabel('front hair_2')).toBe('前发')
    expect(layeredPartLabel('custom charm')).toBe('custom charm')
  })
  it('binds an intentionally closed-eye illustration without inventing sclera or irises', () => {
    const ctx = vm.createContext({ Uint8ClampedArray, Uint8Array, Int32Array, Float32Array })
    for (const name of ['rigger.js', 'debby-parts.js']) vm.runInContext(readFileSync(new URL('../src/renderer/public/vendor/anime25d/' + name, import.meta.url), 'utf8'), ctx)
    const layer = (name: string, left: number, top: number, width: number, height: number) => ({ name, left, top, imageData: { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) } })
    const psd = { width: 128, height: 128, children: [layer('face', 20, 10, 90, 90), layer('eye_close', 30, 50, 20, 4), layer('eye_close', 78, 47, 20, 4), layer('mouth_open', 58, 77, 16, 8)] }
    const rig = ctx.DebbyParts.completeClosedEyes(ctx.Rigger.buildRig(psd))
    expect(rig.anchors.eyeL.icx).toBeLessThan(rig.anchors.eyeR.icx)
    expect(rig.anchors.eyeL.closeY).toBeGreaterThan(rig.anchors.eyeR.closeY)
    expect(rig.layers.some((l: { name: string }) => /irides|eyewhite/.test(l.name))).toBe(false)
    expect(rig.warnings.some((text: string) => text.includes('アンカーが不完全'))).toBe(false)
  })
})
