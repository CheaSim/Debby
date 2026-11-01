import { describe, expect, it } from 'vitest'
import { layeredViewBox } from '../src/shared/avatar-framing'
import type { LayeredRig } from '../src/shared/layered-avatar'

const rig: LayeredRig = { canvas: { w: 1024, h: 1024 }, anchors: { face: { x0: 470, x1: 570, y0: 60, y1: 180 }, neckPivot: { cx: 520, cy: 200 } }, layers: [{ name: 'handwear', z: 0, x: 240, y: 0, w: 160, h: 400 }, { name: 'footwear', z: 1, x: 470, y: 860, w: 150, h: 164 }, { name: 'tail', z: 2, x: 680, y: 480, w: 120, h: 240 }], warnings: [], synth: { eye: false, mouth: false } }
describe('complete character framing', () => {
  it('keeps raised fingertips, shoes and side parts inside the full view, with motion space', () => {
    const view = layeredViewBox(rig)
    expect(view.y).toBe(0); expect(view.h).toBe(1024)
    expect(view.x).toBeLessThan(240); expect(view.x + view.w).toBeGreaterThan(800)
    expect(view.w).toBeLessThan(1024)
    expect(layeredViewBox(rig)).toBe(view)
  })
  it('keeps the complete canvas for adapters without pixel bounds', () => {
    expect(layeredViewBox({ ...rig, layers: [{ name: 'portrait', z: 0 }] })).toEqual({ x: 0, y: 0, w: 1024, h: 1024 })
  })
  it('still supports an explicitly selected close view without making it the default', () => {
    expect(layeredViewBox(rig, true).h).toBeLessThan(rig.canvas.h / 2)
    expect(layeredViewBox(rig).h).toBe(rig.canvas.h)
  })
})
