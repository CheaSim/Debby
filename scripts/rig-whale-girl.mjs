import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { bindPortraitSkeleton } from '../integrations/portrait-skeleton.mjs'
import { migrateRigDocument, validateRig } from '../src/renderer/src/avatar/vendor/standrig/standrig.js'

const folder = resolve(import.meta.dirname, '../src/renderer/public/models/whale-girl')
const source = readFileSync(resolve(folder, 'debby-whale-girl.srig'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const document = bindPortraitSkeleton(JSON.parse(source))
const validation = validateRig(migrateRigDocument(document))
if (!validation.ok) throw Error(JSON.stringify(validation.issues.filter(issue => issue.severity === 'error').slice(0, 2)))
let nodes = 0
const count = value => { nodes++; if (value && typeof value === 'object') Object.values(value).forEach(count) }
count(document)
if (nodes > 190000) throw Error(`Rig exceeds portable node budget: ${nodes}`)
const bytes = JSON.stringify(document)
writeFileSync(resolve(folder, 'debby-whale-girl-rigged.srig'), bytes)
writeFileSync(resolve(folder, 'rig-provenance.json'), JSON.stringify({ source: 'debby-whale-girl.srig', sourceSha256: hash(source), modelSha256: hash(bytes), license: 'CC-BY-NC-SA-4.0', authoring: 'integrations/portrait-skeleton.mjs', engine: 'StandRig 0.2.0 native rotation deformers and three-joint ArtMesh patches', joints: document.deformers.length, parts: document.parts.length, nodes, changes: 'Added a rotation hierarchy, normalized shared-edge mesh skinning, authored eye-patch, hair and tail weights. Original pose textures and attribution unchanged; no inferred hidden artwork or facial segmentation.' }, null, 2) + '\n')
console.log(`Whale skeleton: ${document.deformers.length} joints, ${document.parts.length} parts, ${nodes} portable nodes, ${Buffer.byteLength(bytes)} bytes`)
