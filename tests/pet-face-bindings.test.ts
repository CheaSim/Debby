import { describe, expect, it } from 'vitest'
import { Group, Mesh, BufferGeometry } from 'three'
import { VRMExpression, VRMExpressionManager } from '@pixiv/three-vrm'
import { bindPetExpressions } from '../src/renderer/src/components/pet-face-bindings'

describe('portable model expression bindings', () => {
  it('discovers named morphs and applies independent eye/smile weights without duplicate registration', () => {
    const scene = new Group(), mesh = new Mesh(new BufferGeometry()), expressionManager = new VRMExpressionManager()
    mesh.morphTargetDictionary = { EyeWideLeft: 2, EyeWideRight: 0, MouthSmile: 1 }
    mesh.morphTargetInfluences = [0, 0, 0]; scene.add(mesh)
    const bindings = bindPetExpressions({ scene, expressionManager })
    expressionManager.setValue(bindings.get('bright')!, 0.3)
    expressionManager.setValue(bindings.get('smile')!, 0.2)
    expressionManager.update()
    expect(mesh.morphTargetInfluences).toEqual([0.3, 0.2, 0.3])
    bindPetExpressions({ scene, expressionManager })
    expressionManager.update()
    expect(expressionManager.expressions).toHaveLength(2)
    expect(mesh.morphTargetInfluences).toEqual([0.3, 0.2, 0.3])
  })
  it('keeps standard expressions and single-eye wink fallback on models without custom morphs', () => {
    const expressionManager = new VRMExpressionManager()
    for (const name of ['happy', 'blinkLeft']) expressionManager.registerExpression(new VRMExpression(name))
    const bindings = bindPetExpressions({ scene: new Group(), expressionManager })
    expect(bindings.get('happy')).toBe('happy'); expect(bindings.get('wink')).toBe('blinkLeft')
    expect(bindings.has('heart') || bindings.has('bright') || bindings.has('smile')).toBe(false)
    expect(bindPetExpressions({ scene: new Group(), expressionManager: undefined })).toEqual(new Map())
  })
})
