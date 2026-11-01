import type { ExpressionAvatarDocument, ExpressionPoseSource } from '../src/shared/expression-avatar'
export interface ExpressionAvatarConfig extends Omit<ExpressionAvatarDocument, 'format' | 'version' | 'poses'> {
  poses: (Omit<ExpressionPoseSource, 'psd' | 'sha256'> & { file: string })[]
}
export function packExpressionAvatar(config: ExpressionAvatarConfig, options?: { directory?: string; signal?: AbortSignal }): Promise<Buffer>
