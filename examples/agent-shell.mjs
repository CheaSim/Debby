import { DebbyClient } from '../integrations/client.mjs'
import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'

// node examples/agent-shell.mjs <connection-file-path-from-Debby-MCP-config>
if (!process.argv[2]) throw new Error('请提供 Debby MCP 配置中 --connection 后的文件路径。')
const debby = new DebbyClient(process.argv[2], '示例 Harness')
const taskId = randomUUID()
try {
  await debby.setTask(taskId, '示例 · 整理项目摘要', 'working', .1)
  await debby.say(taskId, 'hello', '我在帮你整理啦，稍等一下。')
  for (const progress of [.3, .6, .9]) {
    await setTimeout(1000)
    // Forward cancellation to your own AbortController / process here.
    if ((await debby.getState()).task?.status === 'cancelled') break
    await debby.setTask(taskId, '示例 · 整理项目摘要', 'working', progress)
  }
  if ((await debby.getState()).task?.status !== 'cancelled') {
    await debby.setTask(taskId, '示例 · 摘要已准备好', 'completed', 1)
    await debby.say(taskId, 'done', '完成啦！这是本地接入示例，没有调用真实模型。')
    await setTimeout(3000)
  }
} finally { await debby.release() }
