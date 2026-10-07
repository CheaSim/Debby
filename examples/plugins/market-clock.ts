import { Type } from 'typebox'
import type { DebbyToolPlugin } from '../../src/main/agent'

export const marketClockPlugin: DebbyToolPlugin = {
  id: 'example.market-clock',
  createTools: () => [{
    name: 'get_shanghai_time', label: '查看上海时间',
    description: '读取当前上海时间；不推断交易日或交易所假期。',
    parameters: Type.Object({}),
    execute: async (_id, _params, signal) => {
      signal?.throwIfAborted()
      const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
      return { content: [{ type: 'text', text: JSON.stringify({ time, timezone: 'Asia/Shanghai' }) }], details: {} }
    }
  }]
}
