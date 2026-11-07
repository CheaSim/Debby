import { describe, expect, it } from 'vitest'
import { validateArchivePaths, validateAvatar } from '../scripts/check-release-assets.mjs'
describe('release asset boundary', () => {
  it.each(['/out/renderer/models/mate-engine/Zome.vrm', '/out/renderer/live2d/haru/a.png', '/out/renderer/vendor/live2dcubismcore.min.js', '/.env', '/.env.production', '/user/agent-bridge.json', '\\work\\secret.txt'])('rejects restricted or private file %s', path => {
    expect(() => validateArchivePaths([path])).toThrow(/Release blocked/)
  })
  it('accepts approved locations and packaged dependencies', () => {
    expect(() => validateArchivePaths(['/out/renderer/models/vrm-sample/Avatar.vrm', '/out/renderer/models/whale-girl/debby-whale-girl.debby', '/node_modules/zod/package.json'])).not.toThrow()
  })
  it('rejects a model whose embedded license disallows redistribution', () => {
    const json = Buffer.from(JSON.stringify({ extensions: { VRMC_vrm: { meta: { allowRedistribution: false } } } }))
    const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
    expect(() => validateAvatar(Buffer.concat([header, json]))).toThrow(/redistribution/)
  })
})
