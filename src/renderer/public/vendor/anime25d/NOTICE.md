# Anime2.5DRig rendering core

Upstream: https://github.com/852wa/Anime2.5DRig
Revision: 7ddbd9943ea3152561b3dc8348fd752c850f3e95
Copyright (c) 2026 hakoniwa. MIT; see LICENSE.

ag-psd: Copyright (c) 2016 Agamnentzar. MIT; see ag-psd-LICENSE.

The files rigger.js, runtime.js, renderer.js and ag-psd.min.js are unmodified upstream files.
debby-rig.js is mechanically extracted/adapted from upstream app.js for host-controlled
parameters and lifecycle. Editor, device capture, OBS, and artwork are not included.
Default bust bounce is disabled. debby-worker.js and procedural fallback strokes are
Debby integration code. Source SHA-256 hashes and adaptation notes are in provenance.json.

See docs/layered-avatar-integration.md and scripts/vendor-anime25d.mjs for reproducibility.
