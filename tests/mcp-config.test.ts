import { describe, expect, it } from 'vitest'
import { makeMcpConfig } from '../src/main/bridge/config'
const paths = { packaged: true, appPath: 'C:/Debby/resources/app.asar', resourcesPath: 'C:/Debby/resources', executable: 'C:/Apps/Debby Space/Debby.exe', connectionPath: 'C:/User Space/agent-bridge.json' }
describe('portable MCP client configuration', () => {
  it('uses the shipped runtime and preserves paths without exposing the connection token', () => {
    const config = JSON.parse(makeMcpConfig(paths, 'json')).mcpServers.debby
    expect(config.command).toBe(paths.executable)
    expect(config.env).toEqual({ ELECTRON_RUN_AS_NODE: '1' })
    expect(config.args.slice(1)).toEqual(['--connection', paths.connectionPath, '--name', 'MCP Agent'])
    expect(config.args[0].replaceAll('\\', '/')).toBe('C:/Debby/resources/mcp/debby-mcp.mjs')
  })
  it('emits the runtime environment as a Codex TOML table', () => {
    const text = makeMcpConfig(paths, 'codex')
    expect(text).toContain('[mcp_servers.debby.env]\nELECTRON_RUN_AS_NODE = "1"')
    expect(JSON.parse(text.split('args = ')[1].split('\n')[0]).at(-1)).toBe('Codex')
    expect(JSON.parse(text.split('command = ')[1].split('\n')[0])).toBe(paths.executable)
  })
  it('keeps source development clients compatible with node', () => {
    const config = JSON.parse(makeMcpConfig({ ...paths, packaged: false }, 'json')).mcpServers.debby
    expect(config.command).toBe('node')
    expect(config.env).toBeUndefined()
    expect(config.args[0].replaceAll('\\', '/')).toBe(`${paths.appPath}/scripts/debby-mcp.mjs`)
  })
})
