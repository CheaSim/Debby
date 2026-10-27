import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { DebbyClient } from '../../integrations/client.mjs'

if (!process.argv[2]) {
  console.error('Usage: node examples/avatar/conversation-dance.mjs <agent-bridge.json path>')
  process.exit(1)
}
// A replaceable agent emits semantic faces with its text. No LLM, TTS or device access.
const debby = new DebbyClient(process.argv[2], 'Conversation + Dance Example')
const taskId = `performance-${randomUUID()}`
const lines = [
  { emotion: 'caring', text: '辛苦啦，今天也陪你慢慢来。' },
  { emotion: 'shy', text: '你说我可爱？有一点点害羞呢。' },
  { emotion: 'proud', text: '你的努力，我都看见啦。' },
  { emotion: 'playful', text: '要不要和我一起动一动？' }
]
try {
  await debby.setTask(taskId, '和你跳支舞', 'working')
  await debby.dance(taskId, { action: 'play', id: 'welcome', expressionStyle: 'gentle' })
  let cancelled = false
  for (const [index, line] of lines.entries()) {
    if ((await debby.getState()).task?.status === 'cancelled') break
    await debby.say(taskId, `line-${index}`, line.text, { expression: { emotion: line.emotion, intensity: .75 } })
    for (let n = 0; n < 8; n++) {
      await setTimeout(250)
      if ((await debby.getState()).task?.status === 'cancelled') { cancelled = true; break }
    }
    if (cancelled) break
  }
  if ((await debby.getState()).task?.status !== 'cancelled') await debby.setTask(taskId, '跳完啦，继续陪你', 'completed', 1)
} finally { await debby.release() }
