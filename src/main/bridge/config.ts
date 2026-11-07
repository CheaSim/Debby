import { join } from 'node:path'

interface McpPaths { packaged: boolean; appPath: string; resourcesPath: string; executable: string; connectionPath: string }
/** Packaged clients reuse Electron's Node runtime; the user's machine needs no separate Node install. */
export function makeMcpConfig(paths: McpPaths, format: 'json' | 'codex'): string {
  const command = paths.packaged ? paths.executable : 'node'
  const script = paths.packaged ? join(paths.resourcesPath, 'mcp', 'debby-mcp.mjs') : join(paths.appPath, 'scripts', 'debby-mcp.mjs')
  const args = [script, '--connection', paths.connectionPath, '--name', format === 'codex' ? 'Codex' : 'MCP Agent']
  const env = paths.packaged ? { ELECTRON_RUN_AS_NODE: '1' } : undefined
  return format === 'codex'
    ? `[mcp_servers.debby]\ncommand = ${JSON.stringify(command)}\nargs = ${JSON.stringify(args)}\n${env ? '\n[mcp_servers.debby.env]\nELECTRON_RUN_AS_NODE = "1"\n' : ''}`
    : JSON.stringify({ mcpServers: { debby: { command, args, ...(env ? { env } : {}) } } }, null, 2)
}
