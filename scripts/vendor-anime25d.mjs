// Maintainer-only, mechanical extraction from the pinned upstream checkout.
// The generated, reviewed runtime is committed; users never download code at startup.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
const root = resolve(import.meta.dirname, '..')
const source = resolve(root, 'work/upstream-anime-rig'), target = resolve(root, 'src/renderer/public/vendor/anime25d')
mkdirSync(target, { recursive: true })
const files = ['lib/rigger.js', 'lib/runtime.js', 'lib/renderer.js', 'lib/ag-psd.min.js', 'LICENSE', 'lib/app.js']
const expected = JSON.parse(readFileSync(resolve(target, 'provenance.json'), 'utf8')).sources
const hashes = {}
for (const file of files) {
  const bytes = readFileSync(resolve(source, file))
  hashes[file] = createHash('sha256').update(bytes).digest('hex')
  if (hashes[file] !== expected[file]) throw Error(`Unexpected upstream bytes for ${file}; review the pin and provenance before regenerating.`)
  if (file !== 'lib/app.js') copyFileSync(resolve(source, file), resolve(target, file.split('/').at(-1)))
}
const app = readFileSync(resolve(source, 'lib/app.js'), 'utf8').replaceAll('\r\n', '\n')
const between = (a, b) => {
  const start = app.indexOf(a), end = app.indexOf(b, start)
  if (start < 0 || end < start) throw Error('Upstream layout changed; review extraction before updating.')
  return app.slice(start, end)
}
const prepare = between('function prepareLayers(rig)', 'function applyAnchors()').replace('L.thumb=makeThumb(image);', '// Debby does not build editor thumbnails.')
const deformation = between('function fadeAlpha(L,e,alt)', '// Still pose used while editing anchors')
const defaults = between('const P={', 'const DEFAULTS=')
const wrapper = `/*! Adapted from Anime2.5DRig app.js, MIT, Copyright (c) 2026 hakoniwa.
 * See LICENSE and provenance.json. Extracted mesh, deformation and physics only.
 * Debby owns animation, lifecycle and input; no camera, microphone, OBS or network.
 */
(function(root){'use strict';
root.DebbyRig = {create(gl,rig){
const RT=root.RigRuntime,Rigger=root.Rigger,renderer=root.RigRenderer.create(gl);
const clamp=RT.clamp;function smooth(t){t=clamp(t,0,1);return t*t*(3-2*t);}
const auto={phys:true},bounce={x:0,v:0,dy:0},blinkVariant=1;
const A=rig.anchors,FS=A.faceScale,NP=A.neckPivot,BP=A.bodyPivot,FC={x:A.face.cx,y:A.face.cy};
const fh=A.face.y1-A.face.y0;
const CHEST={cx:NP.cx,cy:A.neckBottom+fh*.60,rx:Math.max(1,(A.face.x1-A.face.x0)*.60),ry:Math.max(1,fh*.45)};
${defaults}
${prepare}
${deformation}
const layers=prepareLayers(rig);for(const L of layers)buildBangWeights(L);
return {frame(params,dt,time){
 const e=Object.assign({},P,{bust:0,irisBounceX:1,irisBounceY:1},params);
 updateSprings(e,time,dt,true);
 const alt={L:false,R:false},items=[],masks=[];
 for(const L of layers){
  const alpha=fadeAlpha(L,e,alt)*L.opacity,isMask=L.bn==='eyewhite'&&!!L.side;
  if(alpha<.004&&!isMask)continue;
  deform(L,e);renderer.positions(L,L.cur);
  if(isMask)masks.push({L,side:L.side});
  if(alpha>=.004)items.push({L,alpha,clip:L.bn==='irides'&&L.side?L.side:null});
 }
 renderer.draw({width:rig.canvas.w,height:rig.canvas.h,background:[0,0,0,0],items,masks});
},dispose(){layers.forEach(renderer.dispose);}};
}};
})(self);
`
writeFileSync(resolve(target, 'debby-rig.js'), wrapper)
writeFileSync(resolve(target, 'provenance.json'), JSON.stringify({ repository: 'https://github.com/852wa/Anime2.5DRig', commit: '7ddbd9943ea3152561b3dc8348fd752c850f3e95', license: 'MIT', sources: hashes, modifications: 'debby-rig.js mechanically extracts mesh/deformation/springs from app.js; disables bust physics; accepts host parameters. Other source files are unmodified. No artwork or device modules included.' }, null, 2) + '\n')
console.log('Vendored pinned Anime2.5DRig rendering core.')
