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
const armAnchorMotion = `      const left=bcx<NP.cx,raised=L.y<A.face.y0-fh*0.4;
      const rawTurn=clamp((left?e.armL:e.armR)||0,-2.4,2.4)*0.14*(left?1:-1);
      const turn=raised?Math.abs(rawTurn)*(left?-1:1):rawTurn;
      if(turn){
        const px=NP.cx+(left?-1:1)*(A.face.x1-A.face.x0)*0.55,py=A.neckBottom+fh*0.28;
        const weight=smooth(Math.hypot(b[k]-px,b[k+1]-py)/Math.max(1,fh*0.8));
        const th=turn*weight,ct=Math.cos(th),st=Math.sin(th),rx=x-px,ry=y-py;
        x=px+rx*ct-ry*st;y=py+rx*st+ry*ct;
      }
`
const deformation = between('function fadeAlpha(L,e,alt)', '// Still pose used while editing anchors')
  .replace('      y+=e.mouthCY*14*FS;', '      y+=e.mouthCY*14*FS;\n      const q=Math.pow(Math.abs(x-A.mouth.cx)/(mHalfW+4),1.5);\n      y-=e.mouthForm*6*FS*(q-0.35);')
  .replace("    if(bn==='handwear'){\n", "    if(bn==='handwear'){\n" + armAnchorMotion)
  .replace('      y-=e.armY*30*FS*w;y+=e.armPos*40*FS;x+=e.armY*6*FS*w*(x<NP.cx?1:-1);', '      const lift=left?e.armYL:e.armYR,armY=raised?Math.min(0,Number.isFinite(lift)?lift:e.armY):(Number.isFinite(lift)?lift:e.armY);\n      y-=armY*30*FS*w;y+=e.armPos*40*FS;x+=armY*6*FS*w*(x<NP.cx?1:-1);')
const defaults = between('const P={', 'const DEFAULTS=')
const wrapper = `/*! Adapted from Anime2.5DRig app.js, MIT, Copyright (c) 2026 hakoniwa.
 * See LICENSE and provenance.json. Extracted mesh, deformation and physics only.
 * Debby owns animation, lifecycle and input; no camera, microphone, OBS or network.
 */
(function(root){'use strict';
const renderers=new WeakMap();
root.DebbyRig = {create(gl,rig){
const RT=root.RigRuntime,Rigger=root.Rigger;
let renderer=renderers.get(gl);if(!renderer){renderer=root.RigRenderer.create(gl);renderers.set(gl,renderer);}
const clamp=RT.clamp;function smooth(t){t=clamp(t,0,1);return t*t*(3-2*t);}
const auto={phys:true},bounce={x:0,v:0,dy:0},blinkVariant=1;
const A=rig.anchors,FS=A.faceScale,NP=A.neckPivot,BP=A.bodyPivot,FC={x:A.face.cx,y:A.face.cy};
const fh=A.face.y1-A.face.y0;
const CHEST={cx:NP.cx,cy:A.neckBottom+fh*.60,rx:Math.max(1,(A.face.x1-A.face.x0)*.60),ry:Math.max(1,fh*.45)};
${defaults}
${prepare}
${deformation}
const layers=prepareLayers(rig);for(const L of layers)buildBangWeights(L);
const openEyes={},closedEyes={};
for(const L of layers)if(L.side){if(L.fade==='eyeOpen')openEyes[L.side]=true;if(L.fade==='eyeClose'||L.fade==='eyeClose2')closedEyes[L.side]=true;}
return {frame(params,dt,time,expression,context){
 const reduced=!!(context&&context.reducedMotion);
 const e=Object.assign({},P,{bust:0,irisBounceX:1,irisBounceY:1,armL:0,armR:0},params,reduced?{physAmp:0,fhAmp:0,accAmp:0,armL:0,armR:0,armYL:0,armYR:0}:{});
 for(const side of ['L','R'])if(closedEyes[side]&&!openEyes[side])e['eyeOpen'+side]=0;
 updateSprings(e,time,dt,!reduced);
 const hidden=context&&context.hiddenLayers||[];
 const alt={L:false,R:false},items=[],masks=[];
 for(const L of layers){
  if(hidden.includes(L.z))continue;
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
writeFileSync(resolve(target, 'provenance.json'), JSON.stringify({ repository: 'https://github.com/852wa/Anime2.5DRig', commit: '7ddbd9943ea3152561b3dc8348fd752c850f3e95', license: 'MIT', sources: hashes, modifications: 'debby-rig.js extracts mesh/deformation/springs from app.js; disables bust physics; shares the upstream renderer/program/eye mask per WebGL context; accepts host parameters, preview-only hiddenLayers and reduced-motion physics; closed-mouth mesh follows expression mouthForm; independent armL/armR rotate distal arm mesh around inferred shoulder anchors with fixed roots; optional armYL/armYR preserve a holding hand; already-raised hands wave outward without additional upward lift; closed-only eyes retain their authored lines. debby-parts.js normalizes See-through anatomical suffixes before spatial binding and derives missing closed-eye anchors from actual line pixels. Original rigger/runtime/renderer/ag-psd files are unmodified. No upstream artwork or device modules included.' }, null, 2) + '\n')
console.log('Vendored pinned Anime2.5DRig rendering core.')
