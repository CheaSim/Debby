import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Quaternion, Vector3 } from 'three'
import { createWelcomeDance, dancePosition, validateMotion } from '../src/shared/dance'
import { DanceLibrary, validateVrma } from '../src/main/dance-library'
import { ShellRuntime } from '../src/main/bridge/runtime'
import { retargetVideo, solvePose, type PosePoint } from '../src/renderer/src/motion/pose-retarget'
import { createDanceToolsPlugin } from '../src/main/agent/dance-plugin'

const paths: string[] = []
afterEach(() => { vi.useRealTimers(); paths.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })) })
function library(now = Date.now) { const path = mkdtempSync(join(tmpdir(), 'debby-motion-')); paths.push(path); return { path, store: new DanceLibrary(path, () => {}, now) } }
function tPose(): PosePoint[] {
  const p = Array.from({ length: 33 }, () => ({ x: 0, y: -1, z: 0, visibility: 1 }))
  const set = (i: number, x: number, y: number, z = 0) => { p[i] = { x, y: -y, z: -z, visibility: 1 } }
  set(11, .2, 1.5); set(12, -.2, 1.5); set(23, .12, 1); set(24, -.12, 1)
  set(13, .5, 1.5); set(15, .8, 1.5); set(14, -.5, 1.5); set(16, -.8, 1.5)
  set(25, .12, .5); set(27, .12, 0); set(26, -.12, .5); set(28, -.12, 0)
  set(29, .12, 0); set(31, .12, 0, .15); set(30, -.12, 0); set(32, -.12, 0, .15)
  set(7, .1, 1.8); set(8, -.1, 1.8)
  return p
}
function vrma(): Uint8Array {
  const data = new Float32Array([0, 1, 0, 0, 0, 1, 0, 0, Math.sin(.3), Math.cos(.3)])
  const json = { asset: { version: '2.0' }, extensionsUsed: ['VRMC_vrm_animation'], extensions: { VRMC_vrm_animation: { specVersion: '1.0', humanoid: { humanBones: { hips: { node: 0 } } } } },
    nodes: [{ name: 'hips' }], buffers: [{ byteLength: data.byteLength }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: 32 }],
    accessors: [{ bufferView: 0, componentType: 5126, type: 'SCALAR', count: 2 }, { bufferView: 1, componentType: 5126, type: 'VEC4', count: 2 }],
    animations: [{ samplers: [{ input: 0, output: 1 }], channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }] }] }
  const text = Buffer.from(JSON.stringify(json)), padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32); text.copy(padded)
  const result = Buffer.alloc(28 + padded.length + data.byteLength)
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8)
  result.writeUInt32LE(padded.length, 12); result.writeUInt32LE(0x4e4f534a, 16); padded.copy(result, 20)
  result.writeUInt32LE(data.byteLength, 20 + padded.length); result.writeUInt32LE(0x004e4942, 24 + padded.length); Buffer.from(data.buffer).copy(result, 28 + padded.length)
  return new Uint8Array(result)
}
describe('pose retargeting', () => {
  it('maps a front-facing T pose to canonical identity, and raises the anatomical left arm', () => {
    const points = tPose(), pose = solvePose(points)!
    for (const rotation of Object.values(pose)) expect(rotation!.angleTo(new Quaternion())).toBeLessThan(.00001)
    points[13] = { x: .2, y: -1.8, z: 0, visibility: 1 }; points[15] = { x: .2, y: -2.1, z: 0, visibility: 1 }
    const raised = solvePose(points)!
    expect(new Vector3(1, 0, 0).applyQuaternion(raised.leftUpperArm!).distanceTo(new Vector3(0, 1, 0))).toBeLessThan(.00001)
    expect(raised.rightUpperArm!.angleTo(new Quaternion())).toBeLessThan(.00001)
  })
  it('interpolates short occlusions and rejects mostly hidden bodies', () => {
    const samples = Array.from({ length: 25 }, (_, i) => ({ time: i / 24, world: tPose() }))
    samples[12].world = []
    const motion = retargetVideo(samples, 'Pose check', 1)
    expect(motion.quality!.missing).toBe(1)
    for (const track of motion.tracks) for (let i = 0; i < track.rotations.length; i += 4) expect(Math.hypot(...track.rotations.slice(i, i + 4))).toBeCloseTo(1)
    expect(() => retargetVideo(samples.map(s => ({ ...s, world: [] })), 'Hidden', 1)).toThrow(/全身/)
    const invalid = tPose(); invalid[11].x = NaN
    expect(solvePose(invalid)).toBeUndefined()
  })
  it('limits a one-frame orientation flip without producing non-unit rotations', () => {
    const samples = Array.from({ length: 25 }, (_, i) => ({ time: i / 24, world: tPose() }))
    samples[12].world[13].y = -2; samples[12].world[15].y = -2.5
    const track = retargetVideo(samples, 'Noisy', 1).tracks.find(t => t.bone === 'leftUpperArm')!
    for (let i = 4; i < track.rotations.length; i += 4) expect(new Quaternion().fromArray(track.rotations, i).angleTo(new Quaternion().fromArray(track.rotations, i - 4))).toBeLessThan(.51)
  })
})
describe('portable dance assets', () => {
  it('rejects malformed time, duplicate joints and non-finite rotations', () => {
    const motion = createWelcomeDance()
    expect(validateMotion(motion).tracks).toHaveLength(17)
    const bad = structuredClone(motion); bad.tracks[0].times[1] = 0
    expect(() => validateMotion(bad)).toThrow()
    const duplicate = structuredClone(motion); duplicate.tracks[1].bone = duplicate.tracks[0].bone
    expect(() => validateMotion(duplicate)).toThrow()
    const nan = structuredClone(motion); nan.tracks[0].rotations[0] = Infinity
    expect(() => validateMotion(nan)).toThrow()
  })
  it('persists only portable motion; reloads, rejects path traversal, and preserves removed files', () => {
    const { path, store } = library(), motion = createWelcomeDance()
    const entry = store.save({ motion: { ...motion, source: 'video', video: 'private.mp4' } })
    const reloaded = new DanceLibrary(path, () => {})
    expect(reloaded.asset(entry.id).motion!.tracks).toEqual(JSON.parse(JSON.stringify(motion.tracks)))
    expect(reloaded.asset(entry.id).motion).not.toHaveProperty('video')
    expect(() => store.asset('../settings')).toThrow()
    reloaded.remove(entry.id)
    expect(readdirSync(path)).toContain(`${entry.id}.json.removed`)
    writeFileSync(join(path, `${entry.id}.json`), '{broken')
    expect(new DanceLibrary(path, () => {}).snapshot().library).toHaveLength(1)
    store.dispose(); reloaded.dispose()
  })
  it('validates a standard binary VRMA and detects truncated/non-finite animation data', () => {
    const bytes = vrma()
    expect(validateVrma(bytes)).toBe(1)
    expect(() => validateVrma(bytes.slice(0, -4))).toThrow()
    const { store } = library(); const entry = store.save({ name: 'VRMA', bytes })
    expect(store.asset(entry.id).bytes).toEqual(bytes)
    const bad = bytes.slice(); new DataView(bad.buffer).setFloat32(bad.length - 36, Infinity, true)
    expect(() => validateVrma(bad)).toThrow()
    store.dispose()
  })
})
describe('playback clock and Agent priority', () => {
  it('lets the built-in pi plugin list/control saved motions and respects cancellation/user priority', async () => {
    const { store } = library()
    const tools = createDanceToolsPlugin(store).createTools({} as never)
    const response = (await tools[0].execute('list', {})).content[0]
    expect(response.type).toBe('text')
    const list = JSON.parse(response.type === 'text' ? response.text : '{}')
    expect(list.library[0].id).toBe('welcome')
    await tools[1].execute('play', { action: 'play', id: 'welcome' })
    expect(store.snapshot().playback?.origin).toBe('assistant')
    const signal = AbortSignal.abort()
    await expect(tools[1].execute('late', { action: 'play', id: 'welcome' }, signal)).rejects.toThrow()
    store.command({ action: 'play', id: 'welcome' })
    await expect(tools[1].execute('conflict', { action: 'stop' })).rejects.toThrow(/用户/)
    store.dispose()
  })
  it('pauses/seeks/resumes at the correct speed and finishes after invalid commands', () => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    const { store } = library()
    store.command({ action: 'play', id: 'welcome', speed: 1.5 })
    vi.advanceTimersByTime(2000)
    const paused = store.command({ action: 'pause' }).playback!
    expect(dancePosition(paused, 8)).toBe(3)
    vi.advanceTimersByTime(3000); expect(dancePosition(paused, 8)).toBe(3)
    store.command({ action: 'seek', time: 7 }); store.command({ action: 'resume' })
    expect(() => store.command({ action: 'play', id: 'missing' })).toThrow()
    vi.advanceTimersByTime(700); expect(store.snapshot().playback).toBeUndefined()
    store.dispose()
  })
  it('stops Agent-owned looping dances on cancellation/release but preserves user playback', () => {
    const { store } = library()
    const shell = new ShellRuntime(() => {}, Date.now, store); shell.enabled(true)
    const { sessionId } = shell.claim({ name: 'Dance agent' })
    shell.event({ sessionId, seq: 1, taskId: 'dance', type: 'task', title: 'Dance', status: 'working' })
    shell.event({ sessionId, seq: 2, taskId: 'dance', type: 'dance', action: 'play', id: 'welcome', loop: true })
    expect(store.snapshot().playback?.origin).toBe('agent')
    shell.cancel(); expect(store.snapshot().playback).toBeUndefined()
    expect(() => shell.event({ sessionId, seq: 3, taskId: 'dance', type: 'dance', action: 'play', id: 'welcome' })).toThrow(/取消/)
    store.command({ action: 'play', id: 'welcome' })
    shell.release(); expect(store.snapshot().playback?.origin).toBe('user')
    expect(() => store.command({ action: 'stop' }, 'agent')).toThrow(/用户/)
    store.dispose()
  })
})
