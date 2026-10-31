import { portableStandRig, type StandRigAvatarRig } from '../../../shared/standrig-avatar'
import { migrateRigDocument, validateRig } from './vendor/standrig/standrig.js'

export function importStandRig(value: unknown): StandRigAvatarRig {
  const document = migrateRigDocument(portableStandRig(value))
  const validation = validateRig(document)
  if (!validation.ok) throw Error('StandRig 模型校验失败：' + validation.issues.filter(i => i.severity === 'error').slice(0, 2).map(i => i.message).join('；'))
  const { width: w, height: h } = document.stage
  const face = document.metadata?.debby?.face
  if (face && (![face.x0, face.x1, face.y0, face.y1].every(Number.isFinite) || face.x0 < 0 || face.y0 < 0 || face.x1 > w || face.y1 > h || face.x1 <= face.x0 || face.y1 <= face.y0)) throw Error('角色上半身取景范围无效。')
  return { engine: 'standrig', document, canvas: { w, h },
    layers: document.parts.map(p => ({ name: p.name, z: p.drawOrder })),
    anchors: { face: face ?? { x0: w * .3, x1: w * .7, y0: h * .08, y1: h * .28 }, neckPivot: { cx: w / 2, cy: h * .45 } },
    warnings: validation.issues.filter(i => i.severity === 'warning').map(i => i.message), synth: { eye: false, mouth: false }
  }
}
