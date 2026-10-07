import { access } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const restricted = [
  'src/renderer/public/models/mate-engine/Zome.vrm',
  'out/renderer/models/mate-engine/Zome.vrm'
]
const present = []
for (const path of restricted) {
  if (await access(resolve(root, path)).then(() => true, () => false)) present.push(path)
}
if (present.length) {
  throw new Error(`Release blocked: Zome is a local-preview-only asset and must not be included in a FinPet installer. Replace it with a redistribution-authorized avatar before publishing. Restricted assets: ${present.join(', ')}`)
}
