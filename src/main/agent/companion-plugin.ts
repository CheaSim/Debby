import { Type } from 'typebox'
import type { DebbyToolPlugin } from './plugins'
import { avatarActionInfo, avatarActions, type AvatarAction } from '../../shared/avatar'
import { dailyOracle, drawTarot, ritualNote, shanghaiDay, tarotTopics, type TarotSpread, type TarotTopic } from '../../shared/rituals'

export interface CompanionToolPort { performAction(name: AvatarAction): void; now?: () => number; random?: () => number }
/** Framework-neutral content + presentation port. Never reads holdings, credentials or devices. */
export function createCompanionToolsPlugin(port: CompanionToolPort): DebbyToolPlugin {
  const result = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }], details: {} })
  const topic = Type.Union(tarotTopics.map(t => Type.Literal(t)))
  return { id: 'debby.companion', createTools: () => [
    { name: 'perform_avatar_action', label: '做个小动作', description: '根据用户的要求或对话氛围播放一个短动作。每轮至多一个，勿频繁打断。只改变角色动作，不改变行情、任务或设备权限。heart 是双臂收拢的抱抱心意，不是精细手指比心。',
      parameters: Type.Object({ name: Type.Union(avatarActions.map(name => Type.Literal(name))) }),
      execute: async (_id, input, signal) => { signal?.throwIfAborted(); const { name } = input as { name: AvatarAction }; if (!avatarActions.includes(name)) throw Error('Unknown avatar action'); port.performAction(name); return result({ name, ...avatarActionInfo[name] }) } },
    { name: 'draw_tarot', label: '一起翻一张塔罗', description: '用户明确要求塔罗或占卜时调用。22 张大阿卡纳，单张或三张（此刻、留意、下一小步），不放回抽取。仅娱乐、自我探索；不得预测股价、财运结果、疾病或确定的未来，不据此给买卖指令。说明是娱乐，围绕具体牌面温柔地提一个反思问题。',
      parameters: Type.Object({ topic, spread: Type.Union([Type.Literal('single'), Type.Literal('three')]), question: Type.Optional(Type.String({ maxLength: 120 })) }),
      execute: async (_id, input, signal) => { signal?.throwIfAborted(); const { topic, spread, question } = input as { topic: TarotTopic; spread: TarotSpread; question?: string }; return result({ ...drawTarot(topic, spread, question, port.random), note: ritualNote }) } },
    { name: 'get_daily_oracle', label: '抽一支今日签', description: '用户请求今日签、算命或运势时，提供当天稳定的娱乐签文和自我反思提示。明确它不是算出的命运、投资预测或真实运势，不需要生日等个人信息。',
      parameters: Type.Object({ topic }), execute: async (_id, input, signal) => { signal?.throwIfAborted(); return result(dailyOracle(shanghaiDay(port.now?.()), (input as { topic: TarotTopic }).topic)) } }
  ] }
}
