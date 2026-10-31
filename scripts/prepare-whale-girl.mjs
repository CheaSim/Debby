import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { parameterDefinitionsForRig } from '../src/renderer/src/avatar/vendor/standrig/standrig.js'

const root = resolve(import.meta.dirname, '..'), source = resolve(process.argv[2] ?? resolve(root, 'work/upstream-whale-galgame'))
const commit = '046b848f244450e6e636335766276bf3343fe84b'
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim() !== commit) throw Error('Use the reviewed artwork revision: ' + commit)
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: source, encoding: 'utf8' }).trim()) throw Error('Artwork sources must be unmodified.')
const target = resolve(root, 'src/renderer/public/models/whale-girl'), evidence = resolve(root, 'work/whale-girl')
mkdirSync(target, { recursive: true }); mkdirSync(evidence, { recursive: true })
const poses = { neutral: 'maid-left', happy: 'whale-cheerful', shy: 'whale-shy', caring: 'whale-serious', curious: 'whale-confused', surprised: 'whale-frightened', sad: 'whale-exasperated', proud: 'whale-starry', playful: 'whale-cheerful' }
// Authored in the padded 800x1280 stage. Closed eyes have no pupil displacement.
const eyeCenters = { neutral: [[348,178],[414,159]], happy: [], shy: [[361,203],[415,181]], caring: [[366,176],[429,164]], curious: [[379,180],[444,159]], surprised: [[360,178],[419,174]], sad: [[361,173],[424,152]], proud: [[379,186],[459,178]], playful: [] }
const motion = { version: 1, head: { x: 405, y: 175, radiusX: 190, radiusY: 235, pivotX: 405, pivotY: 310 }, eyes: Object.fromEntries(Object.entries(eyeCenters).map(([key, eyes]) => [key, eyes.map(([x,y]) => ({ x, y, radiusX: 23, radiusY: 25 }))])) }
const parameters = parameterDefinitionsForRig({ parameters: [] })
const assets = [], parts = [], inputs = {}, thumbs = [], cleanup = {}
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0, opacity: 1 }
parts.push({ id: 'root', name: 'Root', kind: 'group', parentId: null, visible: true, drawOrder: -1, transform })
// Remove only near-white pixels connected to the image border (source frame/corner remnants).
// Detached highlights and white clothing stay untouched. This is not automatic part separation.
function cleanBorder(data, w, h) {
  const queue = new Int32Array(w * h), seen = new Uint8Array(w * h); let end = 0, start = 0
  const add = p => { if (seen[p]) return; seen[p] = 1; const i = p * 4; if (data[i] >= 245 && data[i + 1] >= 245 && data[i + 2] >= 245 && data[i + 3]) queue[end++] = p }
  for (let x = 0; x < w; x++) { add(x); add((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { add(y * w); add(y * w + w - 1) }
  while (start < end) { const p = queue[start++]; data[p * 4 + 3] = 0; if (p % w) add(p - 1); if (p % w < w - 1) add(p + 1); if (p >= w) add(p - w); if (p < w * (h - 1)) add(p + w) }
  return end
}
const prepared = new Map()
for (const file of new Set(Object.values(poses))) {
  const original = readFileSync(resolve(source, 'assets/default', file + '.webp'))
  inputs[file + '.webp'] = hash(original)
  const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  cleanup[file] = cleanBorder(data, info.width, info.height)
  const png = await sharp(data, { raw: info }).resize(800, 1280, { fit: 'contain', background: '#00000000' }).png({ compressionLevel: 9, palette: true, colours: 256 }).toBuffer()
  prepared.set(file, png)
  thumbs.push({ input: await sharp(png).resize(240, 384).flatten({ background: '#edf1fa' }).png().toBuffer(), left: ((thumbs.length) % 3) * 240, top: Math.floor(thumbs.length / 3) * 384 })
}
for (const [emotion, file] of Object.entries(poses)) {
  const channel = 'Pose_' + emotion, png = prepared.get(file)
  parameters.push({ id: channel, label: emotion, min: 0, max: 1, default: emotion === 'neutral' ? 1 : 0, step: 1 })
  if (!assets.some(a => a.id === file)) assets.push({ id: file, name: file, type: 'image', src: 'data:image/png;base64,' + png.toString('base64'), width: 800, height: 1280 })
  parts.push({ id: emotion, name: emotion, kind: 'image', assetId: file, parentId: 'root', visible: true, drawOrder: parts.length, transform: { ...transform, opacity: emotion === 'neutral' ? 1 : 0 }, bindings: [
    { parameter: channel, property: 'opacity', additive: false, keys: [{ input: 0, value: 0 }, { input: 1, value: 1 }] },
    { parameter: 'ParamBreath', property: 'y', keys: [{ input: 0, value: 0 }, { input: .5, value: -2 }, { input: 1, value: -4 }] }
  ] })
}
const rig = { schemaVersion: '0.1.0', name: 'Debby · 鲸鱼娘', stage: { width: 800, height: 1280, background: 'transparent' },
  assets, parameters, parts, physics: { enabled: false, chains: [] }, deformers: [],
  metadata: { source: 'https://github.com/JAdpp/dsh-whale-galgame/tree/' + commit, notes: 'CC BY-NC-SA 4.0; see NOTICE.md. Portrait expressions with authored image-space gaze/head motion; no separated facial mesh, lip sync or skeletal dance.', debby: { mode: 'portrait-poses', face: { x0: 240, x1: 560, y0: 100, y1: 360 }, motion } },
  facialPresets: { version: 1, expressions: Object.keys(poses).map(emotion => ({ id: emotion, name: emotion, document: { Type: 'Live2D Expression', FadeInTime: 0, FadeOutTime: 0, Parameters: Object.keys(poses).map(key => ({ Id: 'Pose_' + key, Value: key === emotion ? 1 : 0, Blend: 'Overwrite' })) } })) }
}
writeFileSync(resolve(target, 'debby-whale-girl.srig'), JSON.stringify(rig))
await sharp(prepared.get('maid-left')).webp({ quality: 95 }).toFile(resolve(target, 'cover.webp'))
await sharp({ create: { width: 720, height: 1152, channels: 4, background: '#edf1fa' } }).composite(thumbs).png().toFile(resolve(evidence, 'expressions.png'))
for (const [from, to] of [['LICENSE.md', 'UPSTREAM-LICENSE.md'], ['NOTICE.md', 'UPSTREAM-NOTICE.md'], ['assets/default/licenses/dsh-deep-whale-LICENSE.txt', 'LICENSE-CC-BY-NC-SA-4.0.txt'], ['assets/default/licenses/dsh-deep-whale-NOTICE.txt', 'UPSTREAM-ATTRIBUTION.txt']]) writeFileSync(resolve(target, to), readFileSync(resolve(source, from)))
writeFileSync(resolve(target, 'provenance.json'), JSON.stringify({ repository: 'https://github.com/JAdpp/dsh-whale-galgame', commit, license: 'CC-BY-NC-SA-4.0', sources: inputs, changes: 'Removed border-connected near-white source remnants; resized and padded to 800x1280; converted WebP to paletted PNG; packaged as StandRig pose layers; authored per-expression eye anchors and head region for bounded image-space motion. No painting or automatic layer segmentation.', removedPixels: cleanup, modelSha256: hash(readFileSync(resolve(target, 'debby-whale-girl.srig'))) }, null, 2) + '\n')
console.log('Prepared credited whale-girl expression pack; inspect work/whale-girl/expressions.png before release.')
