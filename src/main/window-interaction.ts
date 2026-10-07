export interface WindowPoint { x: number; y: number }
export interface InteractiveRegion extends WindowPoint { width: number; height: number }

export function validPoint(x: unknown, y: unknown): boolean {
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 100_000 && Math.abs(y) <= 100_000
}

export function parseInteractiveRegions(value: unknown, size: { width: number; height: number }): InteractiveRegion[] {
  if (!Array.isArray(value) || value.length > 12) throw new Error('Invalid interactive regions')
  return value.map((region) => {
    if (!region || !validPoint(region.x, region.y) || typeof region.width !== 'number' || typeof region.height !== 'number' ||
      !Number.isFinite(region.width) || !Number.isFinite(region.height) || region.width <= 0 || region.height <= 0 ||
      region.x < 0 || region.y < 0 || region.x + region.width > size.width + 1 || region.y + region.height > size.height + 1) {
      throw new Error('Invalid interactive region')
    }
    return { x: region.x, y: region.y, width: region.width, height: region.height }
  })
}

export function containsPoint(region: InteractiveRegion, point: WindowPoint): boolean {
  return point.x >= region.x && point.y >= region.y && point.x < region.x + region.width && point.y < region.y + region.height
}

export function clampWindowPosition(position: WindowPoint, size: { width: number; height: number }, area: InteractiveRegion): WindowPoint {
  return {
    x: Math.round(Math.max(area.x, Math.min(position.x, area.x + Math.max(0, area.width - size.width)))),
    y: Math.round(Math.max(area.y, Math.min(position.y, area.y + Math.max(0, area.height - size.height))))
  }
}
