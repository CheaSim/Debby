/** StandRig-native authoring adapter. No files, rendering, model provider or device access. */
export function bindPortraitSkeleton(source) {
  const rig = structuredClone(source), { width: w, height: h } = rig.stage
  if (w !== 800 || h !== 1280 || !rig.metadata?.debby?.motion) throw Error('This binding profile requires the credited 800x1280 whale portraits')
  const identity = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0, opacity: 1 }
  const binding = (parameter, property, values, inputs = [-1, 0, 1]) => ({ parameter, property, additive: true, interpolation: 'smoothstep', keys: inputs.map((input, i) => ({ input, value: values[i] })) })
  const joint = (id, parentId, x, y, bindings = []) => ({ id, name: id, kind: 'rotate', parentId, visible: true, origin: { x, y }, transform: { ...identity }, bindings, targetPartIds: [], tags: ['debby-skeleton-v1'] })
  rig.parameters.push(...['DebbyBodySway', 'DebbyNeckTilt', 'DebbyHeadRoll', 'DebbyHairLeft', 'DebbyHairRight', 'DebbyTail'].map(id => ({ id, label: id, min: -1, max: 1, default: 0 })))
  const bones = [
    joint('body-root', null, 400, 940, [binding('DebbyBodySway', 'rotation', [-.65, 0, .65])]),
    joint('torso', 'body-root', 405, 590, [binding('DebbyBodySway', 'rotation', [-.7, 0, .7]), binding('ParamBreath', 'scaleY', [0, .004, .008], [0, .5, 1]), binding('ParamBreath', 'y', [0, -1, -2], [0, .5, 1])]),
    joint('neck', 'torso', 405, 355, [binding('DebbyNeckTilt', 'rotation', [-1.3, 0, 1.3])]),
    joint('head', 'neck', 405, 302, [binding('DebbyHeadRoll', 'rotation', [-4, 0, 4]), binding('ParamAngleX', 'x', [-10, 0, 10], [-30, 0, 30]), binding('ParamAngleX', 'scaleX', [-.035, 0, -.035], [-30, 0, 30]), binding('ParamAngleY', 'y', [7, 0, -7], [-30, 0, 30]), binding('ParamAngleY', 'scaleY', [-.025, 0, .025], [-30, 0, 30])]),
    joint('hair-left', 'head', 310, 285, [binding('DebbyHairLeft', 'rotation', [-2.4, 0, 2.4])]),
    joint('hair-right', 'head', 490, 280, [binding('DebbyHairRight', 'rotation', [-2.4, 0, 2.4])]),
    joint('tail', 'body-root', 585, 925, [binding('DebbyTail', 'rotation', [-2, 0, 2])])
  ]
  // Denser face topology; shared vertex IDs make adjacent patches deform identically.
  const xs = [0, 130, 190, 240, 280, 310, 330, 340, 350, 360, 370, 380, 390, 400, 410, 420, 430, 440, 450, 460, 475, 500, 540, 590, 650, 720, 800]
  const ys = [0, 60, 110, 135, 150, 160, 170, 180, 190, 200, 215, 235, 265, 300, 340, 385, 435, 490, 550, 610, 700, 810, 930, 1060, 1170, 1280]
  const vertices = ys.flatMap((y, row) => xs.map((x, column) => ({ id: `v-${row}-${column}`, x, y, u: x / w, v: y / h })))
  const triangles = []
  for (let row = 0; row < ys.length - 1; row++) for (let column = 0; column < xs.length - 1; column++) {
    const a = row * xs.length + column, b = a + 1, c = a + xs.length, d = c + 1
    triangles.push([a, b, c], [b, d, c])
  }
  const smooth = (a, b, value) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t) }
  const ellipse = (x, y, cx, cy, rx, ry) => { const distance = Math.hypot((x - cx) / rx, (y - cy) / ry); return .72 * (1 - smooth(.15, 1, distance)) }
  const baseWeights = y => { const head = 1 - smooth(260, 370, y), root = smooth(610, 840, y); return { 'body-root': root, torso: 1 - root - head, head } }
  const oldParts = rig.parts.filter(part => part.kind === 'image'), parts = [rig.parts.find(part => part.id === 'root')], poseParts = {}
  for (const pose of oldParts) {
    parts.push({ ...pose, kind: 'group', assetId: undefined, bindings: pose.bindings.filter(b => b.parameter.startsWith('Pose_')), transform: { ...pose.transform } })
    const regions = [
      { id: 'base', joints: ['body-root', 'torso', 'head'], weight: () => 0 },
      { id: 'hair-left', joints: ['torso', 'head', 'hair-left'], weight: p => ellipse(p.x, p.y, 238, 388, 65, 166) },
      { id: 'hair-right', joints: ['torso', 'head', 'hair-right'], weight: p => ellipse(p.x, p.y, 554, 387, 66, 160) },
      { id: 'tail', joints: ['body-root', 'torso', 'tail'], weight: p => ellipse(p.x, p.y, 679, 787, 100, 174) }
    ]
    const eyes = rig.metadata.debby.motion.eyes[pose.id] ?? []
    for (const [index, eye] of eyes.entries()) {
      const id = `${pose.id}-eye-${index}`
      bones.push(joint(id, 'head', eye.x, eye.y, [binding('ParamEyeBallX', 'x', [-3.6, 0, 3.6]), binding('ParamEyeBallY', 'y', [2.8, 0, -2.8])]))
      regions.push({ id, joints: ['torso', 'head', id], weight: p => ellipse(p.x, p.y, eye.x, eye.y, 25, 27) })
    }
    const regionForVertex = vertices.map(p => {
      const candidates = regions.slice(1).map(region => ({ region, weight: region.weight(p) })).filter(v => v.weight > .00001).sort((a, b) => b.weight - a.weight)
      if (candidates.length > 1) throw Error(`Overlapping authored bone regions at ${pose.id}:${p.id}`)
      return candidates[0]
    })
    const groups = new Map(regions.map(region => [region.id, []]))
    for (const triangle of triangles) {
      const choices = new Set(triangle.map(index => regionForVertex[index]?.region.id).filter(Boolean))
      if (choices.size > 1) throw Error(`Refine mesh around intersecting bone regions in ${pose.id}`)
      groups.get([...choices][0] ?? 'base').push(triangle)
    }
    poseParts[pose.id] = []
    for (const region of regions) {
      const cells = groups.get(region.id)
      if (!cells.length) continue
      const used = [...new Set(cells.flat())], remap = new Map(used.map((index, local) => [index, local]))
      const meshVertices = used.map(index => vertices[index]), vertexWeights = {}
      for (const index of used) {
        const vertex = vertices[index], local = regionForVertex[index], weights = baseWeights(vertex.y)
        const influence = local?.region.id === region.id ? local.weight : 0
        const all = Object.entries(weights).map(([deformerId, weight]) => ({ deformerId, weight: weight * (1 - influence) }))
        if (influence) all.push({ deformerId: region.id, weight: influence })
        vertexWeights[vertex.id] = all.filter(v => v.weight > 1e-8)
        if (vertexWeights[vertex.id].some(v => !region.joints.includes(v.deformerId))) throw Error(`Patch contains an unsupported joint: ${pose.id}:${region.id}`)
      }
      const id = `${pose.id}-mesh-${region.id}`
      parts.push({ id, name: id, kind: 'image', assetId: pose.assetId, parentId: pose.id, visible: true, drawOrder: parts.length,
        transform: { ...identity }, artMesh: { version: 1, enabled: true,
          generator: { preset: 'outline', topology: 'rect-grid', columns: 16, rows: 16, alphaThreshold: 1, alphaBounds: { left: 0, top: 0, width: w, height: h } },
          vertices: meshVertices, triangles: cells.flatMap(cell => cell.map(index => remap.get(index))),
          skinning: { version: 1, joints: region.joints.map((deformerId, index) => ({ deformerId, role: ['root', 'middle', 'tip'][index] })), vertexWeights }
        } })
      poseParts[pose.id].push(id)
    }
  }
  rig.parts = parts; rig.deformers = bones
  rig.metadata.debby.skeleton = { version: 1, jointIds: bones.map(b => b.id), poseParts }
  rig.metadata.notes = 'CC BY-NC-SA 4.0; see NOTICE.md. Authored StandRig rotation hierarchy and shared-edge skinned ArtMesh patches over the credited portraits. No new occluded artwork, independent iris/lid sprites, lip sync or 3D dance.'
  return rig
}
