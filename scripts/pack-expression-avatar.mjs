/** Assemble already authored PSDs; this tool does not infer or claim to segment flat images. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function packExpressionAvatar(config, { directory = process.cwd(), signal = new AbortController().signal } = {}) {
  if (!config || !Array.isArray(config.poses) || config.poses.length < 2 || config.poses.length > 12) throw Error('Provide 2–12 PSD poses.')
  const poses = [], seen = new Set(); let total = 0, pixels = 0
  for (const pose of config.poses) {
    signal.throwIfAborted()
    if (!pose || typeof pose.id !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(pose.id) || seen.has(pose.id) || typeof pose.label !== 'string' || !pose.label.trim() || pose.label.length > 40 || typeof pose.file !== 'string' || !/\.psd$/i.test(pose.file) || (pose.eyes !== undefined && pose.eyes !== 'closed') || (pose.mouthRest !== undefined && (!Number.isFinite(pose.mouthRest) || pose.mouthRest < 0 || pose.mouthRest > .85))) throw Error('Invalid pose id, label or PSD path.')
    seen.add(pose.id)
    if (pose.freeArm !== undefined && !['left', 'right'].includes(pose.freeArm)) throw Error('Invalid free arm binding.')
    const bytes = await readFile(resolve(directory, pose.file)); signal.throwIfAborted()
    total += bytes.length
    if (bytes.length < 26 || bytes.length > 16 * 1024 * 1024 || total > 48 * 1024 * 1024 || bytes.subarray(0, 6).toString('hex') !== '384250530001' || bytes.readUInt16BE(22) !== 8 || bytes.readUInt16BE(24) !== 3) throw Error('Use RGB / 8 bit PSDs, at most 16 MB each and 48 MB combined.')
    const height = bytes.readUInt32BE(14), width = bytes.readUInt32BE(18)
    pixels += width * height
    if (!width || !height || width > 4096 || height > 4096 || width * height > 8_000_000 || pixels > 32_000_000) throw Error('PSD dimensions exceed the character decode budget.')
    poses.push({ id: pose.id, label: pose.label, eyes: pose.eyes, mouthRest: pose.mouthRest, freeArm: pose.freeArm, sha256: createHash('sha256').update(bytes).digest('hex'), psd: bytes.toString('base64') })
  }
  const emotions = ['neutral', 'happy', 'caring', 'sad', 'shy', 'surprised', 'curious', 'playful', 'proud']
  const behaviors = ['idle', 'greet', 'pat', 'lifted', 'land', 'celebrate', 'comfort', 'notify', 'working', 'waiting', 'nod', 'shake', 'heart', 'shy', 'think', 'stretch', 'bow', 'clap', 'listening', 'talking']
  if (typeof config.name !== 'string' || !config.name.trim() || config.name.length > 80 || typeof config.defaultPose !== 'string' || !seen.has(config.defaultPose) || !config.expressions || typeof config.expressions !== 'object' || Array.isArray(config.expressions) || config.expressions.neutral !== config.defaultPose || Object.entries(config.expressions).some(([key, id]) => !emotions.includes(key) || !seen.has(id)) || (config.behaviors && (typeof config.behaviors !== 'object' || Array.isArray(config.behaviors) || Object.entries(config.behaviors).some(([key, id]) => !behaviors.includes(key) || !seen.has(id))))) throw Error('Invalid name, default pose or expression mapping.')
  const document = { format: 'debby-expression-bundle', version: 1, name: config.name, defaultPose: config.defaultPose, expressions: config.expressions, behaviors: config.behaviors, poses }
  const bytes = Buffer.from(JSON.stringify(document))
  if (bytes.length > 64 * 1024 * 1024) throw Error('The character bundle exceeds 64 MB.')
  return bytes
}

async function main() {
  const [configFile, outputFile] = process.argv.slice(2)
  if (!configFile || !outputFile || !outputFile.endsWith('.debby')) throw Error('Usage: node scripts/pack-expression-avatar.mjs poses.json character.debby')
  const input = resolve(configFile), output = resolve(outputFile)
  const bytes = await packExpressionAvatar(JSON.parse(await readFile(input, 'utf8')), { directory: dirname(input) })
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, bytes, { flag: 'wx' })
  console.log(JSON.stringify({ output, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
