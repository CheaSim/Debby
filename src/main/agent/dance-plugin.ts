import { Type } from 'typebox'
import type { DebbyToolPlugin } from './plugins'
import type { DanceCommand, DanceState } from '../../shared/dance'
import { danceExpressionStyles } from '../../shared/avatar-performance'

/** Explicit port: no Electron, filesystem, model provider or capture dependency. */
export function createDanceToolsPlugin(port: { snapshot(): DanceState; command(input: DanceCommand, origin: 'assistant'): DanceState }): DebbyToolPlugin {
  const result = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }], details: {} })
  return { id: 'debby.dance', createTools: () => [
    { name: 'list_dances', label: '看看学会的舞蹈', description: '读取 Debby 已保存的舞蹈名称、id、时长及播放状态。用户让你跳舞时先调用，不能编造舞蹈 id。不会读取源视频。', parameters: Type.Object({}),
      execute: async () => result(port.snapshot()) },
    { name: 'control_dance', label: '一起跳支舞', description: '仅在用户要求跳舞、暂停、继续或停止时调用。只能播放已保存的动作，先 list_dances 找 id。学习新舞蹈需引导用户到桌宠选项 → 学跳舞，选择本地视频；不能声称已学习未导入的视频。',
      parameters: Type.Object({ action: Type.Union([Type.Literal('play'), Type.Literal('pause'), Type.Literal('resume'), Type.Literal('stop')]),
        id: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })), speed: Type.Optional(Type.Number({ minimum: .5, maximum: 1.5 })), loop: Type.Optional(Type.Boolean()), expressionStyle: Type.Optional(Type.Union(danceExpressionStyles.map(style => Type.Literal(style)))) }),
      execute: async (_id, input, signal) => { signal?.throwIfAborted(); return result(port.command(input as DanceCommand, 'assistant')) }
    }
  ] }
}
