import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { DebbyClient } from '../integrations/client.mjs'
import { createDebbyMcp } from '../integrations/mcp-server.mjs'

const args = process.argv.slice(2)
const connection = args[args.indexOf('--connection') + 1]
if (!args.includes('--connection') || !connection) {
  console.error('Usage: node scripts/debby-mcp.mjs --connection <agent-bridge.json> [--name <Agent name>]')
  process.exit(1)
}
const name = args.includes('--name') ? args[args.indexOf('--name') + 1] : 'MCP Agent'
const client = new DebbyClient(connection, name)
const handle = serveStdio(() => createDebbyMcp(client), { onerror: () => console.error('Debby MCP transport error') })
let closing = false
async function close() {
  if (closing) return
  closing = true
  await client.release().catch(() => {})
  await handle.close().catch(() => {})
}
process.stdin.on('end', () => void close())
process.on('SIGINT', () => void close())
process.on('SIGTERM', () => void close())
