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
  } };
})(typeof self === 'undefined' ? globalThis : self);
