import { describe, it, expect } from 'vitest'
import { portableExpressionBundle, expressionPose, type ExpressionAvatarRig, type ExpressionAvatarDocument } from '../src/shared/expression-avatar'
import { PortableAvatarBackend } from '../src/renderer/src/avatar/layered-runtime'
import { packExpressionAvatar } from '../scripts/pack-expression-avatar.mjs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'

function fixture(): ExpressionAvatarDocument {
  const bytes = Buffer.alloc(40); bytes.write('8BPS'); bytes.writeUInt16BE(1, 4); bytes.writeUInt32BE(64, 14); bytes.writeUInt32BE(64, 18); bytes.writeUInt16BE(8, 22); bytes.writeUInt16BE(3, 24)
  const pose = { psd: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex') }
  return { format: 'debby-expression-bundle', version: 1, name: '鲸鱼娘', defaultPose: 'calm', expressions: { neutral: 'calm', happy: 'wave' }, behaviors: { greet: 'wave' }, poses: [{ ...pose, id: 'calm', label: '平静' }, { ...pose, id: 'wave', label: '开心招手', eyes: 'closed' }] }
}
describe('one character, several independently layered illustrations', () => {
  it('accepts portable offline sets, rejecting remote data, duplicate poses and unknown mappings', () => {
    expect(portableExpressionBundle(fixture()).poses).toHaveLength(2)
    const remote = fixture(); remote.poses[0].psd = 'https://example.com/portrait.psd'
    expect(() => portableExpressionBundle(remote)).toThrow('内嵌 PSD')
    const duplicate = fixture(); duplicate.poses[1].id = 'calm'
    expect(() => portableExpressionBundle(duplicate)).toThrow('标识')
    expect(() => portableExpressionBundle({ ...fixture(), expressions: { neutral: 'calm', happy: 'absent' } })).toThrow('映射')
    expect(() => portableExpressionBundle({ ...fixture(), behaviors: { execute: 'wave' } })).toThrow('映射')
    const huge = fixture(), bytes = Buffer.from(huge.poses[0].psd, 'base64'); bytes.writeUInt32BE(12000, 14); huge.poses[0].psd = bytes.toString('base64')
    expect(() => portableExpressionBundle(huge)).toThrow('解码尺寸')
  })
  it('honors explicit dialogue emotion, preview override, gesture mapping and neutral fallback', () => {
    const rig = { expressionSet: { ...fixture(), poses: [{ id: 'calm' }, { id: 'wave' }] } } as unknown as ExpressionAvatarRig
    expect(expressionPose(rig, undefined, 'greet').id).toBe('wave')
    expect(expressionPose(rig, { emotion: 'neutral', intensity: .8 }, 'greet').id).toBe('calm')
    expect(expressionPose(rig, { emotion: 'happy', intensity: .8 }, undefined, 'calm').id).toBe('calm')
    expect(expressionPose(rig, { emotion: 'sad', intensity: .8 }).id).toBe('calm')
  })
  it('rejects tampered embedded PSD before starting any parser worker', async () => {
    const doc = fixture(); doc.poses[0].sha256 = '0'.repeat(64)
    await expect(new PortableAvatarBackend().parse(new Blob([JSON.stringify(doc)]), { signal: new AbortController().signal })).rejects.toThrow('校验失败')
  })
  it('packs relative PSD paths with hashes, and rejects incomplete or cancelled authoring jobs', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'debby-expression-'))
    try {
      const fixtureDoc = fixture(); await writeFile(join(folder, 'neutral.psd'), Buffer.from(fixtureDoc.poses[0].psd, 'base64'))
      const config = { ...fixtureDoc, poses: fixtureDoc.poses.map(pose => ({ id: pose.id, label: pose.label, file: 'neutral.psd', eyes: pose.eyes })) }
      const bytes = await packExpressionAvatar(config, { directory: folder })
      const document = portableExpressionBundle(JSON.parse(bytes.toString('utf8')))
      expect(document.poses[0].sha256).toBe(fixtureDoc.poses[0].sha256)
      const abort = new AbortController(); abort.abort()
      await expect(packExpressionAvatar(config, { directory: folder, signal: abort.signal })).rejects.toHaveProperty('name', 'AbortError')
      await expect(packExpressionAvatar({ ...config, expressions: { neutral: 'missing' } }, { directory: folder })).rejects.toThrow('mapping')
      const oversized = Buffer.from(fixtureDoc.poses[0].psd, 'base64'); oversized.writeUInt32BE(12000, 14)
      await writeFile(join(folder, 'neutral.psd'), oversized)
      await expect(packExpressionAvatar(config, { directory: folder })).rejects.toThrow('decode budget')
    } finally { await rm(folder, { recursive: true, force: true }) }
  })
})
