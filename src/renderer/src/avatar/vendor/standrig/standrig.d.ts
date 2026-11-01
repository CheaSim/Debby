import type { StandRigDocument, StandRigParameter } from '../../../../../shared/standrig-avatar'
import type { Affine2D } from '../../../../../shared/avatar-skeleton'
export function migrateRigDocument(value: unknown): StandRigDocument
export function validateRig(rig: StandRigDocument): { ok: boolean; issues: { severity: string; message: string }[] }
export function parameterDefinitionsForRig(rig: StandRigDocument): StandRigParameter[]
export class RigRuntime {
  constructor(rig: StandRigDocument, options?: { cacheEvaluation?: boolean })
  loadAssets(): Promise<void>
  render(canvas: HTMLCanvasElement, values: Record<string, number>, options: { transparent: boolean; fitPadding: number; webglWarp?: boolean }): void
  dispose(): void
}
export function resolveRigFrame(rig: StandRigDocument, values: Record<string, number>, baseMatrix: Affine2D, options?: { physics?: boolean }): { skinningTransforms: Map<string, Affine2D> }
export function applySkinningToVertices<T extends { id: string; x: number; y: number }>(vertices: readonly T[], skinning: { version: number; joints: { deformerId: string; role: string }[]; vertexWeights: Record<string, { deformerId: string; weight: number }[]> }, transforms: Map<string, Affine2D>): T[]
export class FacialController {
  constructor(rig: StandRigDocument)
  command(request: { action: 'expression'; id: string; strength: number } | { action: 'clear'; layer: 'expression' }, now: number): unknown
  evaluate(base: Record<string, number>, now: number): Record<string, number>
}
