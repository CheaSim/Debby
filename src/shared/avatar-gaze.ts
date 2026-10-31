export interface CursorPosition { x: number; y: number; source: 'desktop' | 'browser' }
export interface CursorSource {
  getCursorPosition(): Promise<CursorPosition | null>
  onCursorPosition(listener: (point: CursorPosition) => void): () => void
}
export interface GazeBounds { left: number; top: number; width: number; height: number }

/** Both the native DIP adapter and browser adapter supply viewport CSS pixels. */
export function gazeFromCursor(point: CursorPosition | null, bounds: GazeBounds, faceY = .35): { x: number; y: number } {
  if (!point || ![point.x, point.y, bounds.left, bounds.top, bounds.width, bounds.height, faceY].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 }
  return {
    x: Math.atan((point.x - bounds.left - bounds.width / 2) / (bounds.width * .7)) * 2 / Math.PI,
    y: Math.atan((point.y - bounds.top - bounds.height * faceY) / (bounds.height * .6)) * 2 / Math.PI
  }
}

/** No clock or DOM dependency: a host can inject its own pointer source and frame loop. */
export function createAvatarGaze(source: CursorSource): { read(bounds: GazeBounds, faceY?: number): { x: number; y: number }; dispose(): void } {
  let point: CursorPosition | null = null, active = true, received = false
  const unsubscribe = source.onCursorPosition(next => { received = true; point = next })
  void source.getCursorPosition().then(initial => { if (active && !received) point = initial }).catch(() => {})
  return { read: (bounds, faceY) => gazeFromCursor(point, bounds, faceY), dispose() { if (active) { active = false; unsubscribe() } } }
}
