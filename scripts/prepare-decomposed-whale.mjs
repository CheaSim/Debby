/** Maintainer asset curation. Requires actual See-through PSD; never segments a flat portrait. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..'), input = resolve(process.argv[2] || ''), output = process.argv[3] && resolve(process.argv[3])
if (!process.argv[2] || !output) throw Error('Usage: node scripts/prepare-decomposed-whale.mjs INPUT.psd OUTPUT-DIRECTORY [INFERENCE-METADATA.json]')
const source = readFileSync(input), hash = bytes => createHash('sha256').update(bytes).digest('hex')
const metadata = process.argv[4] ? JSON.parse(readFileSync(resolve(process.argv[4]), 'utf8')) : undefined
if (metadata?.sourcePsdSha256 && metadata.sourcePsdSha256 !== hash(source)) throw Error('Inference metadata belongs to a different source PSD.')
const context = vm.createContext({ console, Uint8Array, Uint8ClampedArray, ArrayBuffer, DataView, TextEncoder, TextDecoder })
for (const name of ['ag-psd.min.js', 'rigger.js', 'debby-parts.js']) vm.runInContext(readFileSync(resolve(root, 'src/renderer/public/vendor/anime25d', name), 'utf8'), context)
context.agPsd.initializeCanvas(undefined, (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }))
const psd = context.agPsd.readPsd(new Uint8Array(source), { useImageData: true, skipThumbnail: true, skipCompositeImageData: true })
const baseRig = context.Rigger.buildRig(context.DebbyParts.normalizeLayerNames(psd))
const A = baseRig.anchors, F = A.face, M = A.mouth
if (!A.eyeL || !A.eyeR || !baseRig.layers.some(l => l.name === 'tail') || !baseRig.layers.some(l => l.name === 'bottomwear')) throw Error('Missing key semantic parts; do not publish this generation.')
const changes = []
// The experimental head checkpoint sometimes paints an entire face in its nose
// channel. Constrain only that erroneous channel; keep the inpainted face below.
for (const layer of psd.children.filter(l => l.name === 'nose' && l.imageData)) {
  const d = layer.imageData; let pixels = 0
  for (let i = 3; i < d.data.length; i += 4) if (d.data[i] > 15) pixels++
  if (pixels < (F.x1 - F.x0) * (F.y1 - F.y0) * .08) continue
  const eyeX = (A.eyeL.icx + A.eyeR.icx) / 2, eyeY = (A.eyeL.icy + A.eyeR.icy) / 2
  const cx = eyeX + (M.cx - eyeX) * .3, cy = eyeY + (M.cy - eyeY) * .55
  const rx = (F.x1 - F.x0) * .075, ry = (F.y1 - F.y0) * .045
  for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) {
    const distance = Math.hypot((x + layer.left - cx) / rx, (y + layer.top - cy) / ry)
    const offset = (y * d.width + x) * 4 + 3
    d.data[offset] *= Math.max(0, Math.min(1, (1 - distance) * 5))
  }
  changes.push('Constrained oversized generated nose mask to the nose between eye and mouth anchors; removed duplicated facial features from that layer.')
}
async function strokeLayer(name, x, y, width, height, path, color, lineWidth) {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><path d="${path}" fill="none" stroke="${color}" stroke-width="${lineWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>`)
  const { data, info } = await sharp(svg).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { name, left: Math.round(x), top: Math.round(y), right: Math.round(x) + info.width, bottom: Math.round(y) + info.height, opacity: 1, imageData: { width: info.width, height: info.height, data: new Uint8ClampedArray(data) } }
}
// Original companion-friendly blink and closed lip accents. Slant follows the
// actual eyes in this portrait, rather than horizontal generic placeholder art.
const eyeSlope = (A.eyeR.icy - A.eyeL.icy) / (A.eyeR.icx - A.eyeL.icx)
for (const side of ['L', 'R']) {
  const E = A['eye' + side], w = Math.max(14, Math.ceil((E.x1 - E.x0) * 1.18)), h = Math.max(14, Math.ceil(w * .7))
  const mid = h * .4, rise = eyeSlope * w * .42, thickness = Math.max(1.8, w * .065)
  const eye = await strokeLayer('eye_close', (E.x0 + E.x1 - w) / 2, E.closeY - mid, w, h, `M 2 ${mid - rise} Q ${w * .5} ${mid + w * .28} ${w - 2} ${mid + rise} M 3 ${mid - rise + 1} L 1 ${mid - rise + 3}`, '#3e3548', thickness)
  psd.children.push(eye)
}
const mw = Math.max(12, Math.ceil((M.x1 - M.x0) * 1.12)), mh = Math.max(12, Math.ceil(mw * .65)), my = mh * .4
const lip = await strokeLayer('mouth_close', M.cx - mw / 2, M.y0 + (M.y1 - M.y0) * .3 - my, mw, mh, `M 2 ${my - eyeSlope * mw * .35} Q ${mw * .5} ${my + mw * .2} ${mw - 2} ${my + eyeSlope * mw * .35}`, '#9a5d72', Math.max(1.8, mw * .055))
psd.children.push(lip)
// Painter order matters: closed features must sit under front hair/headwear.
const accents = psd.children.splice(-3)
let at = psd.children.findIndex(l => context.Rigger.normName(l.name) === 'front hair'); if (at < 0) at = psd.children.length
psd.children.splice(at, 0, ...accents)
changes.push('Authored independent slanted closed-eye and closed-mouth RGBA strokes, aligned to detected eye/mouth anchors; original model-generated open features retained.')
context.Rigger.cleanPsdLayers(psd)
const rig = context.Rigger.buildRig(psd)
if (rig.layers.filter(l => l.name.startsWith('eye_close')).length < 2 || !rig.layers.some(l => l.name === 'mouth_close')) throw Error('Authored close accents did not survive pixel cleanup.')
const visible = []
for (const layer of psd.children) if (!layer.hidden && layer.imageData) {
  const d = layer.imageData
  visible.push({ input: await sharp(d.data, { raw: { width: d.width, height: d.height, channels: 4 } }).png().toBuffer(), left: layer.left, top: layer.top })
}
// Authored closed variants are hidden in PSD's neutral composite; the runtime
// independently activates them through its semantic fade channels.
const neutralLayers = visible.filter((_, i) => !['eye_close', 'mouth_close'].includes(psd.children.filter(l => !l.hidden && l.imageData)[i].name))
const neutral = await sharp({ create: { width: psd.width, height: psd.height, channels: 4, background: '#00000000' } }).composite(neutralLayers).png().toBuffer()
// Keep all close variants visible as source layers so the runtime imports them.
psd.imageData = { width: psd.width, height: psd.height, data: new Uint8ClampedArray(await sharp(neutral).raw().toBuffer()) }
const bytes = Buffer.from(context.agPsd.writePsd(psd, { generateThumbnail: false }))
if (output === resolve(root, 'src/renderer/public/models/whale-girl')) {
  const qa = JSON.parse(readFileSync(resolve(root, 'work/decomposed-avatar/measurements.json'), 'utf8'))
  if (!(qa.metrics.foregroundRatio > 0 && qa.metrics.foregroundRatio <= 1.15)) throw Error('Reject opaque background or stale alpha QA.')
  if (qa.modelSha256 !== hash(bytes) || qa.metrics.silhouetteCoverage < .95 || qa.metrics.eyeFace <= .1 || qa.metrics.eyeBody >= .001 || qa.metrics.mouthFace <= .1 || qa.metrics.blinkFace <= .1 || qa.metrics.faceLayer <= 1 || qa.metrics.tailLayer <= .1 || qa.metrics.reduced >= .001) throw Error('Run the real-art E2E on this exact curated PSD before publishing it.')
}
mkdirSync(output, { recursive: true })
writeFileSync(resolve(output, 'debby-whale-girl.psd'), bytes)
writeFileSync(resolve(output, 'decomposed-preview.png'), neutral)
writeFileSync(resolve(output, 'layered-provenance.json'), JSON.stringify({ license: 'CC-BY-NC-SA-4.0', original: { repository: 'https://github.com/JAdpp/dsh-whale-galgame', commit: '046b848f244450e6e636335766276bf3343fe84b', file: 'assets/default/maid-left.webp' }, inference: { engine: 'See-through', repository: 'https://github.com/shitagaki-lab/see-through', commit: 'df019de5129d6c4b406587a14c3501669441a783', sourcePsd: basename(input), sourceSha256: hash(source), run: metadata }, changes, modelSha256: hash(bytes), canvas: rig.canvas, parts: rig.layers.map(l => ({ name: l.name, z: l.z, x: l.x, y: l.y, width: l.w, height: l.h })), warnings: rig.warnings }, null, 2) + '\n')
console.log(JSON.stringify({ psd: resolve(output, 'debby-whale-girl.psd'), parts: rig.layers.length, bytes: bytes.length, warnings: rig.warnings }))
