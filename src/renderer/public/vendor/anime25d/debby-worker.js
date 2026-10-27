/* Debby PSD authoring boundary. No devices, network or UI inside the parser. */
importScripts('ag-psd.min.js', 'rigger.js', 'runtime.js');
agPsd.initializeCanvas(undefined, (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }));
self.onmessage = ({ data: buffer }) => {
  try {
    RigRuntime.validateHeader(buffer);
    const options = { useImageData: true, skipThumbnail: true, skipCompositeImageData: true };
    postMessage({ progress: '检查图层…' });
    const meta = agPsd.readPsd(new Uint8Array(buffer), { ...options, skipLayerImageData: true });
    Rigger.validatePsd(meta);
    let count = 0, pixels = 0;
    const check = layers => { for (const l of layers || []) {
      if (++count > 256) throw Error('图层超过 256 层，请精简角色 PSD。');
      const w = Math.max(0, (l.right || 0) - (l.left || 0)), h = Math.max(0, (l.bottom || 0) - (l.top || 0));
      pixels += w * h;
      if (!Number.isFinite(pixels) || pixels > 64000000) throw Error('图层展开后过大，请缩小 PSD。');
      check(l.children);
    }};
    check(meta.children);
    postMessage({ progress: '展开图像并自动绑定…' });
    const psd = agPsd.readPsd(new Uint8Array(buffer), options);
    Rigger.cleanPsdLayers(psd);
    // Original procedural closed-eye / closed-mouth strokes, not upstream artwork.
    const stroke = mouth => {
      const cv = new OffscreenCanvas(160, 48), ctx = cv.getContext('2d');
      ctx.strokeStyle = '#392c3b'; ctx.lineWidth = mouth ? 4 : 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(12, 18); ctx.quadraticCurveTo(80, mouth ? 42 : 45, 148, 18); ctx.stroke();
      if (!mouth) { ctx.beginPath(); ctx.moveTo(16, 23); ctx.lineTo(9, 30); ctx.stroke(); }
      return ctx.getImageData(0, 0, 160, 48);
    };
    const eye = stroke(false);
    const rig = Rigger.buildRig(psd, { generic: { eyeL: eye, eyeR: eye, mouth: stroke(true) } });
    if (!rig.layers.length || !rig.layers.some(l => Rigger.baseName(l.name) === 'face')) throw Error('需要包含 face（脸）图层的分层角色 PSD。');
    const transfers = new Set();
    for (const layer of rig.layers) transfers.add(layer.img.data.buffer);
    postMessage({ rig }, [...transfers]);
  } catch (error) { postMessage({ error: error.message || String(error) }); }
};
