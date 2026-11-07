import { readFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { listPackage, extractFile } from '@electron/asar'

const root = resolve(import.meta.dirname, '..')
const approved = [
  ['models/vrm-sample/Avatar.vrm', '12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2'],
  ['models/whale-girl/debby-whale-girl.debby', '0b856bb04afc207d959b656c8d531f0683becb721ace0fae1f7c3b8be7844bb8']
]
const notices = ['models/vrm-sample/NOTICE.md', 'models/whale-girl/NOTICE.md', 'models/whale-girl/LICENSE-CC-BY-NC-SA-4.0.txt', 'models/whale-girl/expressions-provenance.json', 'vendor/anime25d/LICENSE', 'vendor/anime25d/ag-psd-LICENSE', 'vendor/standrig/LICENSE', 'vendor/standrig/UPSTREAM-NOTICE', 'mocap/LICENSE']
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

/** Check what actually ships; local optional preview assets may remain in the developer checkout. */
export function validateArchivePaths(paths) {
  const forbidden = paths.map(p => p.replaceAll('\\', '/')).filter(p => /(^|\/)(\.env(?:\.[^/]*)?|agent-bridge\.json)(\/|$)/i.test(p) || /\/out\/renderer\/(models\/mate-engine|live2d)(\/|$)/i.test(p) || /live2dcubismcore\.min\.js$/i.test(p) || /(^|\/)(work|\.git)(\/|$)/i.test(p))
  if (forbidden.length) throw Error(`Release blocked: restricted/private files in app archive: ${forbidden.join(', ')}`)
}
export function validateAvatar(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(16) !== 0x4e4f534a) throw Error('Invalid VRM GLB')
  const model = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'))
  const meta = model.extensions?.VRMC_vrm?.meta
  if (meta?.allowRedistribution !== true || meta?.licenseUrl !== 'https://vrm.dev/licenses/1.0/' || meta?.name !== 'VRM1_Constraint_Twist_Sample') throw Error('Release blocked: avatar redistribution metadata changed')
}
async function verifyAssets(read) {
  for (const [path, hash] of approved) {
    const bytes = await read(path)
    if (digest(bytes) !== hash) throw Error(`Release blocked: unreviewed asset ${path}`)
    if (path.endsWith('.vrm')) validateAvatar(bytes)
  }
  for (const path of notices) if (!(await read(path)).length) throw Error(`Missing notice: ${path}`)
}
export async function checkReleaseBuild() {
  await verifyAssets(path => readFile(resolve(root, 'out/renderer', path)))
  for (const path of ['RELEASE-NOTICES.md', 'LICENSE', 'out/mcp/debby-mcp.mjs']) await access(resolve(root, path))
  console.log('Approved avatars and license notices verified. Archive exclusions will be checked after packing.')
}
export async function verifyReleaseArchive(appOutDir) {
  const archive = resolve(appOutDir, 'resources/app.asar')
  validateArchivePaths(listPackage(archive))
  await verifyAssets(async path => extractFile(archive, join('out', 'renderer', ...path.split('/'))))
  for (const path of ['mcp/debby-mcp.mjs', 'mcp/THIRD-PARTY-LICENSES.txt', 'RELEASE-NOTICES.md', 'LICENSE']) await access(resolve(appOutDir, 'resources', path))
  console.log('Packed app verified: approved assets, bundled MCP, notices; no restricted models or local secrets.')
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await checkReleaseBuild()
