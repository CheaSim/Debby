import { describe, expect, it } from 'vitest'
import { clampWindowPosition, containsPoint, parseInteractiveRegions, validPoint } from '../src/main/window-interaction'

describe('desktop interaction boundaries', () => {
  it('only accepts finite screen coordinates', () => {
    expect(validPoint(-1920, 540)).toBe(true)
    for (const x of [NaN, Infinity, '300', 1_000_000]) expect(validPoint(x, 0)).toBe(false)
    expect(validPoint(0, NaN)).toBe(false)
  })

  it('accepts bounded toolbar regions without extra properties', () => {
    expect(parseInteractiveRegions([{ x: 51, y: 487, width: 278, height: 40, extra: true }], { width: 380, height: 540 }))
      .toEqual([{ x: 51, y: 487, width: 278, height: 40 }])
  })

  it('rejects invalid and oversized interactive regions', () => {
    for (const regions of [null, Array(13).fill({ x: 0, y: 0, width: 1, height: 1 }),
      [{ x: -1, y: 0, width: 30, height: 30 }], [{ x: 0, y: 0, width: Infinity, height: 30 }],
      [{ x: 0, y: 0, width: 0, height: 30 }], [{ x: 375, y: 0, width: 30, height: 30 }]]) {
      expect(() => parseInteractiveRegions(regions, { width: 380, height: 540 })).toThrow()
    }
  })

  it('restores interaction only inside the toolbar', () => {
    const region = { x: 51, y: 487, width: 278, height: 40 }
    expect(containsPoint(region, { x: 103, y: 507 })).toBe(true)
    expect(containsPoint(region, { x: 190, y: 260 })).toBe(false)
    expect(containsPoint(region, { x: 329, y: 527 })).toBe(false)
  })

  it('clamps dragging to the work area, including negative monitor origins', () => {
    const size = { width: 380, height: 540 }
    expect(clampWindowPosition({ x: 1900, y: 1000 }, size, { x: 0, y: 0, width: 1920, height: 1032 }))
      .toEqual({ x: 1540, y: 492 })
    expect(clampWindowPosition({ x: -2500, y: -500 }, size, { x: -1920, y: 0, width: 1920, height: 1032 }))
      .toEqual({ x: -1920, y: 0 })
  })

  it('keeps an oversized window anchored on a smaller display', () => {
    expect(clampWindowPosition({ x: 200, y: 200 }, { width: 960, height: 680 }, { x: 0, y: 0, width: 800, height: 600 }))
      .toEqual({ x: 0, y: 0 })
  })
})
