import { build } from 'esbuild'
import { resolve } from 'node:path'
import { readFile, readdir, writeFile } from 'node:fs/promises'
const root = resolve(import.meta.dirname, '..')
const result = await build({ entryPoints: [resolve(import.meta.dirname, 'debby-mcp.mjs')], outfile: resolve(root, 'out/mcp/debby-mcp.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node24', metafile: true,
  banner: { js: "import { createRequire as __debbyCreateRequire } from 'node:module'; const require = __debbyCreateRequire(import.meta.url);" } })
const packages = new Set(Object.keys(result.metafile.inputs).map(p => p.replaceAll('\\', '/').match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//)?.[1]).filter(Boolean))
const notices = ['Third-party licenses for the bundled Debby MCP bridge. Debby adapter code: MIT.']
for (const directory of [...packages].sort()) {
  const path = resolve(root, directory), meta = JSON.parse(await readFile(resolve(path, 'package.json'), 'utf8'))
  notices.push(`\n===== ${meta.name} ${meta.version} (${meta.license ?? 'see upstream'}) =====`)
  for (const file of (await readdir(path)).filter(p => /^(LICENSE|COPYING|NOTICE)(\.|$)/i.test(p))) notices.push(await readFile(resolve(path, file), 'utf8'))
}
await writeFile(resolve(root, 'out/mcp/THIRD-PARTY-LICENSES.txt'), notices.join('\n'))
console.log('Standalone MCP bridge bundled; no external npm dependencies required.')
