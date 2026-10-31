import type { StandRigDocument, StandRigParameter } from '../../../../../shared/standrig-avatar'
export function migrateRigDocument(value: unknown): StandRigDocument
export function validateRig(rig: StandRigDocument): { ok: boolean; issues: { severity: string; message: string }[] }
export function parameterDefinitionsForRig(rig: StandRigDocument): StandRigParameter[]
export class RigRuntime {
  constructor(rig: StandRigDocument, options?: { cacheEvaluation?: boolean })
  loadAssets(): Promise<void>
  render(canvas: HTMLCanvasElement, values: Record<string, number>, options: { transparent: boolean; fitPadding: number }): void
  dispose(): void
}
export class FacialController {
  constructor(rig: StandRigDocument)
  command(request: { action: 'expression'; id: string; strength: number } | { action: 'clear'; layer: 'expression' }, now: number): unknown
  evaluate(base: Record<string, number>, now: number): Record<string, number>
}
