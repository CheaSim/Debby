import { setTimeout } from 'node:timers/promises'
import { DebbyClient } from '../../integrations/client.mjs'

if (!process.argv[2]) throw new Error('Usage: node examples/avatar/expression-stream.mjs <agent-bridge.json>')
const debby = new DebbyClient(process.argv[2], 'Expression v1 example')
try {
  const { expressionProtocol } = await debby.getState()
  if (expressionProtocol?.version !== 1) throw new Error('Please update Debby to a version supporting Expression v1')
  const task = `expression-${Date.now()}`
  await debby.setTask(task, '表情流式示例', 'working')
  const chunks = ['[[emo', 'tion:caring|0.7]]', '今天辛苦啦，', '我陪你歇一会儿。', '[[emotion:play', 'ful|0.8]]', '要不要听个小笑话？']
  for (const [index, chunk] of chunks.entries()) {
    await debby.say(task, 'reply', chunk, { append: index > 0, done: index === chunks.length - 1 })
    await setTimeout(300)
  }
  await debby.setTask(task, '示例完成', 'completed', 1)
  await setTimeout(4000)
} finally { await debby.release() }
