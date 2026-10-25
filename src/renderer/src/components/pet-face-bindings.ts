import { Mesh } from 'three'
import { VRMExpression, VRMExpressionMorphTargetBind, type VRM } from '@pixiv/three-vrm'
import { faceChannels, type FaceChannel } from '../../../shared/pet-expression'

const aliases: Record<FaceChannel, string[]> = {
  happy: ['happy'], sad: ['sad'], relaxed: ['relaxed'], aa: ['aa'], oh: ['oh'],
  heart: ['Heart'], star: ['Star'], wink: ['Wink', 'blinkLeft'], fun2: ['Fun2'], sorrow2: ['Sorrow2'],
  bright: ['debbyBright'], smile: ['debbySmile'], blush: ['debbyBlush']
}

/** Discover named morphs rather than assuming a model's mesh or morph-target indices. */
export function bindPetExpressions(vrm: Pick<VRM, 'scene' | 'expressionManager'>): Map<FaceChannel, string> {
  const manager = vrm.expressionManager, bindings = new Map<FaceChannel, string>()
  if (!manager) return bindings
  for (const [name, shapes] of [
    ['debbyBright', ['EyeWideLeft', 'EyeWideRight']], ['debbySmile', ['MouthSmile']], ['debbyBlush', ['FaceRed']]
  ] as const) {
    if (manager.getExpression(name)) continue
    const expression = new VRMExpression(name)
    vrm.scene.traverse((object) => {
      if (!(object instanceof Mesh) || !object.morphTargetInfluences) return
      for (const shape of shapes) {
        const index = object.morphTargetDictionary?.[shape]
        if (index === undefined || index >= object.morphTargetInfluences.length) continue
        expression.addBind(new VRMExpressionMorphTargetBind({ primitives: [object], index, weight: 1 }))
      }
    })
    if (expression.binds.length) { manager.registerExpression(expression); vrm.scene.add(expression) }
  }
  const available = Object.keys(manager.expressionMap)
  for (const channel of faceChannels) {
    const name = aliases[channel].map((alias) => available.find((candidate) => candidate.toLowerCase() === alias.toLowerCase())).find(Boolean)
    if (name) bindings.set(channel, name)
  }
  return bindings
}
