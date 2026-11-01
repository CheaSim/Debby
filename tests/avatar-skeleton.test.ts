import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSkeletonMotion } from '../src/shared/avatar-skeleton'
import { importStandRig } from '../src/renderer/src/avatar/standrig-import'
import { applySkinningToVertices, parameterDefinitionsForRig, resolveRigFrame } from '../src/renderer/src/avatar/vendor/standrig/standrig.js'

const pack = (): Record<string, any> => JSON.parse(readFileSync(new URL('../src/renderer/public/models/whale-girl/debby-whale-girl-rigged.srig', import.meta.url), 'utf8'))
const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
const area = (a: any, b: any, c: any): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

describe('native portrait skeleton', () => {
  it('keeps every patch connected, normalized and unfolded through extreme joint combinations', () => {
    const raw = pack(), rig = importStandRig(raw)
    expect(rig.warnings).toEqual([])
    expect(raw.deformers).toHaveLength(21)
    const defaults = Object.fromEntries(parameterDefinitionsForRig(rig.document).map(p => [p.id, p.default]))
    const channels = ['DebbyBodySway', 'DebbyNeckTilt', 'DebbyHeadRoll', 'DebbyHairLeft', 'DebbyHairRight', 'DebbyTail']
    const extremes = [defaults, ...Array.from({ length: 64 }, (_, bits) => ({ ...defaults,
      ...Object.fromEntries(channels.map((id, i) => [id, bits & 1 << i ? 1 : -1])),
      ParamAngleX: bits & 1 ? 30 : -30, ParamAngleY: bits & 2 ? 30 : -30,
      ParamEyeBallX: bits & 4 ? 1 : -1, ParamEyeBallY: bits & 8 ? 1 : -1, ParamBreath: bits & 16 ? 1 : 0
    }))]
    let maxSeam = 0, minAreaRatio = Infinity, identityError = 0, maxWeightError = 0, invalidWeights = 0
    let worst = ''
    const joints = new Set(raw.deformers.map((joint: any) => joint.id))
    for (const values of extremes) {
      const frame = resolveRigFrame(rig.document, values, identity, { physics: false })
      for (const ids of Object.values(raw.metadata.debby.skeleton.poseParts) as string[][]) {
        const seams = new Map<string, { x: number; y: number }>()
        for (const id of ids) {
          const mesh = raw.parts.find((part: any) => part.id === id).artMesh
          const vertices = applySkinningToVertices(mesh.vertices, mesh.skinning, frame.skinningTransforms)
          for (const [index, vertex] of vertices.entries()) {
            const weights = mesh.skinning.vertexWeights[vertex.id]
            if (weights.length > 3 || weights.some((weight: any) => !joints.has(weight.deformerId) || weight.weight < 0)) invalidWeights++
            maxWeightError = Math.max(maxWeightError, Math.abs(weights.reduce((sum: number, weight: any) => sum + weight.weight, 0) - 1))
            const previous = seams.get(vertex.id)
            if (previous) maxSeam = Math.max(maxSeam, Math.hypot(vertex.x - previous.x, vertex.y - previous.y))
            seams.set(vertex.id, vertex)
            if (values === defaults) identityError = Math.max(identityError, Math.hypot(vertex.x - mesh.vertices[index].x, vertex.y - mesh.vertices[index].y))
          }
          for (let i = 0; i < mesh.triangles.length; i += 3) {
            const indices = mesh.triangles.slice(i, i + 3)
            const ratio = area(vertices[indices[0]], vertices[indices[1]], vertices[indices[2]]) / area(mesh.vertices[indices[0]], mesh.vertices[indices[1]], mesh.vertices[indices[2]])
            if (ratio < minAreaRatio) { minAreaRatio = ratio; worst = `${id}: ${indices.map((index: number) => mesh.vertices[index].id).join(',')}` }
          }
        }
      }
    }
    expect(identityError).toBeLessThan(1e-7)
    expect(invalidWeights).toBe(0); expect(maxWeightError).toBeLessThan(1e-7)
    expect(maxSeam).toBeLessThan(1e-7)
    expect(minAreaRatio, worst).toBeGreaterThan(.35)
  }, 20000)

  it('transforms the head through actual parent joints while keeping the feet planted', () => {
    const raw = pack(), rig = importStandRig(raw)
    const values = Object.fromEntries(parameterDefinitionsForRig(rig.document).map(p => [p.id, p.default]))
    const frame = resolveRigFrame(rig.document, { ...values, DebbyHeadRoll: 1, DebbyNeckTilt: 1 }, identity, { physics: false })
    const parts = raw.parts.filter((part: any) => part.parentId === 'neutral' && part.artMesh)
    const vertices = parts.flatMap((part: any) => applySkinningToVertices(part.artMesh.vertices, part.artMesh.skinning, frame.skinningTransforms))
    const head = vertices.find((p: any) => p.id === 'v-5-13'), feet = vertices.find((p: any) => p.id === 'v-24-13')
    expect(Math.hypot(head.x - 400, head.y - 160)).toBeGreaterThan(10)
    expect(feet.x).toBeCloseTo(400, 7); expect(feet.y).toBeCloseTo(1170, 7)
  })

  it('rejects unknown or stale skeleton references at the portable boundary', () => {
    for (const mutate of [
      (rig: any) => { rig.metadata.debby.skeleton.version = 2 },
      (rig: any) => { rig.metadata.debby.skeleton.jointIds.push('missing') },
      (rig: any) => { rig.metadata.debby.skeleton.poseParts.neutral.push('missing') }
    ]) { const raw = pack(); mutate(raw); expect(() => importStandRig(raw)).toThrow() }
  })
})

describe('clock-injected secondary motion', () => {
  it('lags after gaze changes, remains bounded on irregular clocks, and resets for reduced motion', () => {
    const motion = createSkeletonMotion()
    const first = motion.update({ angleX: 1, angleZ: 0, body: .1 }, 0, 0)
    let next = first
    for (let frame = 1; frame <= 60; frame++) next = motion.update({ angleX: 1, body: .1 }, 1 / 60, frame / 60)
    expect(Math.abs(next.DebbyHairLeft)).toBeGreaterThan(Math.abs(first.DebbyHairLeft) + .1)
    for (const dt of [NaN, Infinity, -.1, 0, .016, .5, 1000]) {
      for (const value of Object.values(motion.update({ angleX: NaN, body: 100, angleZ: -100 }, dt, NaN))) {
        expect(Number.isFinite(value)).toBe(true); expect(Math.abs(value)).toBeLessThanOrEqual(1)
      }
    }
    expect(Object.values(motion.update({ angleX: 1 }, .016, 20, true)).every(value => value === 0)).toBe(true)
    expect(motion.update({}, 0, 0).DebbyHairLeft).toBe(0)
  })
})
