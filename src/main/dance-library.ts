import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createWelcomeDance, danceLimits, dancePosition, emptyDanceState, validateMotion, type DanceAsset, type DanceCommand, type DanceEntry, type DanceState } from '../shared/dance'

/** Local motion store and playback clock. The renderer, MCP and future agents use this contract. */
export class DanceLibrary {
  private state = emptyDanceState()
  private timer?: NodeJS.Timeout
  constructor(private directory: string, private changed: (state: DanceState) => void, private now = Date.now) {
    mkdirSync(directory, { recursive: true })
    for (const file of readdirSync(directory).filter(f => /^[a-f\d-]{36}\.json$/.test(f)).slice(0, danceLimits.library)) {
      try { const asset = this.read(file.slice(0, -5)); this.state.library.push(asset.entry) } catch { /* A corrupt entry cannot stop the companion from opening. */ }
    }
    this.state.library.unshift({ id: 'welcome', name: 'Debby 的小小律动', duration: 8, format: 'motion', source: 'builtin', createdAt: 0 })
  }
  snapshot(): DanceState { return structuredClone(this.state) }
  private publish(): void { this.state.revision++; this.changed(this.snapshot()) }
  private path(id: string): string { if (!/^[a-f\d-]{36}$/.test(id)) throw Error('找不到这支舞蹈。'); return join(this.directory, `${id}.json`) }
  private read(id: string): DanceAsset {
    if (statSync(this.path(id)).size > danceLimits.fileBytes * 1.5) throw Error('动作文件过大。')
    const record = JSON.parse(readFileSync(this.path(id), 'utf8'))
    if (record.entry?.id !== id || typeof record.entry?.name !== 'string' || !record.entry.name.trim() || record.entry.name.length > 64 || !Number.isFinite(record.entry.createdAt)) throw Error('动作损坏。')
    if (record.entry.format === 'motion') {
      const motion = validateMotion(record.motion)
      return { entry: { id, name: motion.name, format: 'motion', duration: motion.duration, source: motion.source, createdAt: record.entry.createdAt, quality: motion.quality }, motion }
    }
    if (record.entry.format !== 'vrma' || typeof record.bytes !== 'string') throw Error('动作损坏。')
    const bytes = new Uint8Array(Buffer.from(record.bytes, 'base64'))
    const duration = validateVrma(bytes)
    return { entry: { id, name: record.entry.name, duration, format: 'vrma', source: 'import', createdAt: record.entry.createdAt }, bytes }
  }
  asset(id: string): DanceAsset {
    if (id === 'welcome') return { entry: this.state.library[0], motion: createWelcomeDance() }
    if (!this.state.library.some(e => e.id === id)) throw Error('找不到这支舞蹈。')
    return this.read(id)
  }
  save(input: unknown): DanceEntry {
    if (this.state.library.length > danceLimits.library) throw Error('动作库已满，请先移除不需要的舞蹈。')
    const value = input as { motion?: unknown; name?: unknown; bytes?: Uint8Array }
    if (!value || typeof value !== 'object') throw Error('动作不正确。')
    const motion = value.motion ? validateMotion(value.motion) : undefined
    const bytes = !motion && value.bytes instanceof Uint8Array ? value.bytes : undefined
    if (!motion && (!bytes || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 64)) throw Error('请选择动作文件。')
    const duration = motion ? motion.duration : validateVrma(bytes!)
    const entry: DanceEntry = { id: randomUUID(), name: motion?.name ?? (value.name as string).trim(), duration, format: motion ? 'motion' : 'vrma', source: motion?.source ?? 'import', createdAt: this.now(), quality: motion?.quality }
    const record = JSON.stringify({ entry, motion, bytes: bytes ? Buffer.from(bytes).toString('base64') : undefined })
    if (Buffer.byteLength(record) > danceLimits.fileBytes * 1.5) throw Error('动作文件过大。')
    const path = this.path(entry.id)
    writeFileSync(`${path}.tmp`, record, { mode: 0o600 }); renameSync(`${path}.tmp`, path)
    this.state.library.push(entry); this.publish()
    return entry
  }
  remove(id: string): void {
    if (id === 'welcome') throw Error('内置动作不能移除。')
    if (!this.state.library.some(e => e.id === id)) throw Error('找不到这支舞蹈。')
    if (this.state.playback?.id === id) this.command({ action: 'stop' })
    // Keep a recoverable copy; only the library entry is removed.
    renameSync(this.path(id), `${this.path(id)}.removed`)
    this.state.library = this.state.library.filter(e => e.id !== id); this.publish()
  }
  command(input: DanceCommand, origin: 'user' | 'agent' | 'assistant' = 'user'): DanceState {
    if (!input || !['play', 'pause', 'resume', 'stop', 'seek'].includes(input.action)) throw Error('未知的舞蹈操作。')
    const previous = this.state.playback
    if (origin !== 'user' && previous && previous.origin !== origin) throw Error(previous.origin === 'user' ? '用户正在播放舞蹈，请等用户停止。' : '其他 Agent 正在播放舞蹈，请等它停止。')
    if (input.action === 'play') {
      if (!this.state.library.some(e => e.id === input.id)) throw Error('找不到这支舞蹈。')
      const speed = input.speed ?? 1
      if (!Number.isFinite(speed) || speed < .5 || speed > 1.5 || (input.loop !== undefined && typeof input.loop !== 'boolean')) throw Error('播放速度须在 0.5–1.5 倍之间。')
      this.state.playback = { id: input.id, status: 'playing', offset: 0, startedAt: this.now(), speed, loop: input.loop ?? false, origin }
    } else if (input.action === 'stop') this.state.playback = undefined
    else if (previous) {
      const duration = this.state.library.find(e => e.id === previous.id)!.duration
      const offset = input.action === 'seek' ? input.time : dancePosition(previous, duration, this.now())
      if (!Number.isFinite(offset) || offset < 0 || offset > duration) throw Error('播放位置不正确。')
      this.state.playback = { ...previous, offset, startedAt: this.now(), status: input.action === 'pause' ? 'paused' : input.action === 'resume' ? 'playing' : previous.status }
    }
    if (this.timer) clearTimeout(this.timer)
    this.schedule(); this.publish(); return this.snapshot()
  }
  stopOwned(origin: 'agent' | 'user' | 'assistant'): void { if (this.state.playback?.origin === origin) this.command({ action: 'stop' }) }
  private schedule(): void {
    const p = this.state.playback
    if (!p || p.status === 'paused' || p.loop) return
    const duration = this.state.library.find(e => e.id === p.id)!.duration
    this.timer = setTimeout(() => this.command({ action: 'stop' }), Math.max(1, (duration - p.offset) / p.speed * 1000))
    this.timer.unref()
  }
  dispose(): void { if (this.timer) clearTimeout(this.timer) }
}

/** Animation-only GLB: no network references, meshes, images, or executable extensions. */
export function validateVrma(bytes: Uint8Array): number {
  if (bytes.length < 32 || bytes.length > danceLimits.fileBytes) throw Error('VRMA 文件须小于 16 MB。')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length || view.getUint32(16, true) !== 0x4e4f534a) throw Error('不是有效的 VRMA / GLB 文件。')
  const jsonLength = view.getUint32(12, true), binStart = 20 + jsonLength
  if (binStart + 8 > bytes.length || view.getUint32(binStart + 4, true) !== 0x004e4942 || binStart + 8 + view.getUint32(binStart, true) !== bytes.length) throw Error('VRMA 数据块损坏。')
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, binStart)))
  const extension = json.extensions?.VRMC_vrm_animation
  if (json.asset?.version !== '2.0' || !extension?.humanoid?.humanBones?.hips || !json.extensionsUsed?.includes('VRMC_vrm_animation') || (extension.specVersion && !['1.0', '1.0-draft'].includes(extension.specVersion)) || !Array.isArray(json.animations) || json.animations.length !== 1 || (json.nodes?.length ?? 0) > 256 || (json.accessors?.length ?? 0) > 512 ||
    (json.meshes?.length ?? 0) || (json.images?.length ?? 0) || (json.textures?.length ?? 0) || json.buffers?.length !== 1 || json.buffers[0].uri !== undefined || !Number.isInteger(json.buffers[0].byteLength) || json.buffers[0].byteLength > bytes.length - binStart - 8) throw Error('仅支持单段、自包含的 VRMA 动作，不支持模型或外部资源。')
  const binaryLength = json.buffers[0].byteLength
  for (const accessor of json.accessors ?? []) {
    const buffer = json.bufferViews?.[accessor.bufferView], components = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[accessor.type]
    const offset = accessor.byteOffset ?? 0, stride = buffer?.byteStride ?? components * 4
    if (!buffer || buffer.buffer !== 0 || accessor.sparse || accessor.componentType !== 5126 || !components || !Number.isInteger(accessor.count) || accessor.count < 1 || accessor.count > danceLimits.frames * 3 || !Number.isInteger(offset) || offset < 0 || offset % 4 || !Number.isInteger(stride) || stride < components * 4 || stride > 252 || stride % 4 || !Number.isInteger(buffer.byteOffset ?? 0) || (buffer.byteOffset ?? 0) < 0 || (buffer.byteOffset ?? 0) % 4 || !Number.isInteger(buffer.byteLength) || buffer.byteLength < 0 || (buffer.byteOffset ?? 0) + buffer.byteLength > binaryLength || offset + (accessor.count - 1) * stride + components * 4 > buffer.byteLength) throw Error('动作数据越界或轨道格式不受支持。')
    for (let i = 0; i < accessor.count; i++) for (let n = 0; n < components; n++) {
      const value = view.getFloat32(binStart + 8 + (buffer.byteOffset ?? 0) + offset + i * stride + n * 4, true)
      if (!Number.isFinite(value) || Math.abs(value) > 10000) throw Error('动作包含无效数值。')
    }
  }
  let duration = 0
  for (const animation of json.animations) for (const sampler of animation.samplers ?? []) {
    const accessor = json.accessors?.[sampler.input], buffer = json.bufferViews?.[accessor?.bufferView]
    if (!accessor || accessor.type !== 'SCALAR' || accessor.componentType !== 5126 || !Number.isInteger(accessor.count) || accessor.count < 2 || accessor.count > danceLimits.frames || !buffer || buffer.buffer !== 0) throw Error('动作时间轨道不正确。')
    const start = binStart + 8 + (buffer.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride = buffer.byteStride ?? 4
    if (start < binStart + 8 || start + (accessor.count - 1) * stride + 4 > bytes.length || stride < 4) throw Error('动作数据越界。')
    let last = -1
    for (let i = 0; i < accessor.count; i++) {
      const time = view.getFloat32(start + i * stride, true)
      if (!Number.isFinite(time) || time < 0 || time <= last || time > danceLimits.motionSeconds) throw Error('动作时间不正确。')
      last = time; duration = Math.max(duration, time)
    }
  }
  for (const channel of json.animations[0].channels ?? []) {
    const sampler = json.animations[0].samplers?.[channel.sampler], input = json.accessors?.[sampler?.input], output = json.accessors?.[sampler?.output]
    const path = channel.target?.path, expected = path === 'rotation' ? 'VEC4' : path === 'translation' || path === 'scale' ? 'VEC3' : undefined
    if (!expected || !json.nodes?.[channel.target?.node] || !input || !output || output.type !== expected || !['LINEAR', 'STEP', 'CUBICSPLINE'].includes(sampler.interpolation ?? 'LINEAR') || output.count !== input.count * (sampler.interpolation === 'CUBICSPLINE' ? 3 : 1)) throw Error('动作通道不正确。')
  }
  if (duration < .1) throw Error('动作太短。')
  return duration
}
