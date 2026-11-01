/* Debby compatibility shim. Original code, MIT. Upstream rigger stays unmodified. */
(function (root) {
  'use strict';
  // See-through emits anatomical -l/-r suffixes; the rigger derives screen
  // sides from actual alpha positions. Preserve layers, normalize only roles.
  const roles = /^(eyewhite|irides|eyelash|eyebrow|eye[_ ]close|ears|handwear)[ _-](l|r|left|right)$/i;
  root.DebbyParts = { normalizeLayerNames(psd) {
    function visit(layers) { for (const layer of layers || []) {
      const match = roles.exec(String(layer.name || '').normalize('NFKC'));
      if (match) layer.name = match[1];
      if (layer.children) visit(layer.children);
    } }
    visit(psd.children); return psd;
  }, completeClosedEyes(rig) {
    // A deliberately closed-eye illustration has lashes, but no sclera/iris.
    // Infer only its closed-line anchors; never manufacture open-eye pixels.
    for (const side of ['L', 'R']) {
      if (rig.anchors['eye' + side]) continue;
      const layers = rig.layers.filter(l => l.side === side && /^eye_close(?:2)?(?:_[lr])?$/.test(l.name));
      let sum = 0, cx = 0, cy = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const layer of layers) {
        const img = layer.img;
        for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
          const alpha = img.data[(y * img.width + x) * 4 + 3]; if (alpha <= 16) continue;
          const px = layer.x + x, py = layer.y + y;
          sum += alpha; cx += px * alpha; cy += py * alpha;
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        }
      }
      if (sum) rig.anchors['eye' + side] = { x0, x1, y0, y1, icx: cx / sum, icy: cy / sum, closeY: cy / sum };
    }
    if (rig.anchors.eyeL && rig.anchors.eyeR) rig.warnings = rig.warnings.filter(w => w !== '目のアンカーが不完全です（eyewhite/irides を確認）');
    return rig;
  } };
})(typeof self === 'undefined' ? globalThis : self);
