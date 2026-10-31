import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { importStandRig } from '../src/renderer/src/avatar/standrig-import'
import { portableStandRig, standRigParameters } from '../src/shared/standrig-avatar'
import { FacialController, parameterDefinitionsForRig } from '../src/renderer/src/avatar/vendor/standrig/standrig.js'

const pack = (): Record<string, any> => JSON.parse(readFileSync(new URL('../src/renderer/public/models/whale-girl/debby-whale-girl.srig', import.meta.url), 'utf8'))
describe('StandRig portable model boundary', () => {
  it('validates the real credited pack and selects exactly one complete pose', () => {
    const rig = importStandRig(pack()), facial = new FacialController(rig.document)
    expect(rig.warnings).toEqual([])
    const defaults = Object.fromEntries(parameterDefinitionsForRig(rig.document).map(p => [p.id, p.default]))
    for (const emotion of ['happy', 'shy', 'caring', 'sad', 'surprised', 'neutral']) {
      facial.command({ action: 'expression', id: emotion, strength: 1 }, 100)
      const poses = Object.entries(facial.evaluate(defaults, 100)).filter(([id, v]) => id.startsWith('Pose_') && v > 0)
      expect(poses).toEqual([['Pose_' + emotion, 1]])
    }
  })
  it('rejects external URLs, disguised textures, excessive decoded dimensions and invalid references', () => {
    const remote = pack(); remote.assets[0].src = 'https://example.com/image.png'
    expect(() => importStandRig(remote)).toThrow('内嵌 PNG')
    const svg = pack(); svg.assets[0].src = 'data:image/svg+xml;base64,AAAA'
    expect(() => importStandRig(svg)).toThrow('内嵌 PNG')
    const large = pack(), png = Buffer.from(large.assets[0].src.slice(22), 'base64')
    png.writeUInt32BE(100_000, 16); large.assets[0].width = 1; large.assets[0].src = 'data:image/png;base64,' + png.toString('base64')
    expect(() => importStandRig(large)).toThrow('解码尺寸')
    const broken = pack(); broken.parts[1].assetId = 'missing'
    expect(() => importStandRig(broken)).toThrow('校验失败')
    const crop = pack(); crop.metadata.debby.face.x0 = crop.stage.width
    expect(() => importStandRig(crop)).toThrow('取景范围')
    const anchors = pack(); anchors.metadata.debby.motion.eyes.neutral[0].radiusX = -1
    expect(() => importStandRig(anchors)).toThrow('视线绑定')
    const head = pack(); head.metadata.debby.motion.head.pivotY = 9999
    expect(() => importStandRig(head)).toThrow('视线绑定')
    expect(() => portableStandRig({ ...pack(), schemaVersion: 'future' })).toThrow('模型版本')
  })
  it('accepts a portable bundle and clamps host channels to the authored range', () => {
    expect(importStandRig({ format: 'standrig-bundle', rig: pack() }).engine).toBe('standrig')
    expect(standRigParameters({ angleX: 10, mouthOpen: .7, brow: NaN }, [
      { id: 'ParamAngleX', min: -15, max: 15, default: 0 },
      { id: 'ParamMouthOpen', min: 0, max: 1, default: 0 },
      { id: 'ParamBrowLY', min: -1, max: 1, default: 0 }
    ])).toEqual({ ParamAngleX: 15, ParamMouthOpen: .7 })
  })
})
