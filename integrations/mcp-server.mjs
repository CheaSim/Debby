import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

const id = z.string().regex(/^[\w.-]{1,80}$/)
const task = { taskId: id.describe('Unique task ID. Never reuse a completed or cancelled ID.') }
export function createDebbyMcp(client) {
  const server = new McpServer({ name: 'debby', version: '0.1.0' }, {
    instructions: 'Debby is a local avatar shell. Read state before working and periodically during long tasks. If task.status is cancelled, stop your task. Start a task before saying or animating. Use a new taskId for each new task; release when finished. These tools display status only and grant no execution or media permission.'
  })
  const register = (name, description, schema, handler, readOnlyHint = false) => server.registerTool(name, {
    description, inputSchema: schema,
    annotations: { readOnlyHint, destructiveHint: false, openWorldHint: false }
  }, async (args) => {
    try {
      const state = await handler(args)
      return { content: [{ type: 'text', text: JSON.stringify(state) }] }
    } catch (error) { return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Debby request failed' }] } }
  })
  register('debby_get_state', 'Read connection, current task, cancellation and avatar capabilities. Does not claim control.', z.object({}).strict(), () => client.getState(), true)
  register('debby_set_task', 'Present task progress: working, waiting for user input, completed or error. A cancelled task cannot be resumed.', z.object({
    ...task, title: z.string().trim().min(1).max(100), status: z.enum(['working', 'waiting', 'completed', 'error']), progress: z.number().min(0).max(1).optional()
  }).strict(), ({ taskId, title, status, progress }) => client.setTask(taskId, title, status, progress))
  register('debby_say', 'Display plain text in Debby. No cloud TTS. For streaming, keep turnId fixed, append=true for later chunks, done=true for the last chunk. Maximum assembled text 2000 characters.', z.object({
    ...task, turnId: id, text: z.string().trim().min(1).max(2000), append: z.boolean().default(false), done: z.boolean().default(true)
  }).strict(), ({ taskId, turnId, text, append, done }) => client.say(taskId, turnId, text, { append, done }))
  register('debby_animate', 'Play a curated 3D avatar gesture. User interactions take priority. Does not change the financial mood.', z.object({
    ...task, name: z.enum(['greet', 'celebrate', 'comfort', 'notify'])
  }).strict(), ({ taskId, name }) => client.animate(taskId, name))
  register('debby_release', 'Release this Agent connection after finishing. Other Agents can then take control.', z.object({}).strict(), async () => { await client.release(); return { released: true } })
  return server
}
