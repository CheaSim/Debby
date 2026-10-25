import { randomUUID } from 'node:crypto'
import { setTimeout } from 'node:timers/promises'
import { DebbyClient } from '../integrations/client.mjs'

if (!process.argv[2]) {
  console.error('Usage: node examples/dance-agent.mjs <agent-bridge.json path> [dance-id]')
  process.exit(1)
}
const debby = new DebbyClient(process.argv[2], 'Dance Harness')
const taskId = `dance-${randomUUID()}`
try {
  const { library } = await debby.listDances()
  const entry = library.find(e => e.id === (process.argv[3] || 'welcome'))
  if (!entry) throw Error('Dance not found. Import a video or VRMA in Debby first.')
  await debby.setTask(taskId, `和你跳：${entry.name}`, 'working')
  await debby.dance(taskId, { action: 'play', id: entry.id })
  const deadline = Date.now() + (entry.duration + 5) * 1000
  while (Date.now() < deadline) {
    const state = await debby.getState()
    if (state.task?.status === 'cancelled' || state.dances?.playback?.origin !== 'agent') break
    await setTimeout(250)
  }
  if ((await debby.getState()).task?.status !== 'cancelled') await debby.setTask(taskId, '跳完啦', 'completed', 1)
} finally { await debby.release() }
