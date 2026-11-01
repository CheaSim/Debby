import type { LayeredRig } from './layered-avatar'

export interface AvatarViewBox { x: number; y: number; w: number; h: number }
const fullViews = new WeakMap<LayeredRig, AvatarViewBox>()

/** Keep the complete vertical canvas and all authored parts, trimming only empty side margins. */
export function layeredViewBox(rig: LayeredRig, portrait = false): AvatarViewBox {
  const { w, h } = rig.canvas, face = rig.anchors.face
  if (portrait) {
    const width = Math.min(w, (face.x1 - face.x0) * 2.25), height = Math.min(h, (face.y1 - face.y0) * 2.8)
    return { x: Math.max(0, Math.min(w - width, (face.x0 + face.x1 - width) / 2)), y: Math.max(0, Math.min(h - height, face.y0 - (face.y1 - face.y0) * .65)), w: width, h: height }
  }
  const cached = fullViews.get(rig)
  if (cached) return cached
  const parts = rig.layers.filter(layer => [layer.x, layer.y, layer.w, layer.h].every(Number.isFinite) && layer.w! > 0 && layer.h! > 0)
  let view = { x: 0, y: 0, w, h }
  if (parts.length) {
    const left = Math.min(...parts.map(layer => layer.x!)), right = Math.max(...parts.map(layer => layer.x! + layer.w!))
    const margin = Math.max((right - left) * .16, (face.x1 - face.x0) * .6)
    const x0 = Math.max(0, left - margin), x1 = Math.min(w, right + margin)
    if (x1 > x0) view = { x: x0, y: 0, w: x1 - x0, h }
  }
  fullViews.set(rig, view)
  return view
}
