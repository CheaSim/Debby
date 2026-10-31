# StandRig browser runtime

StandRig 0.2.0, Copyright 2026 StandRig contributors, licensed under Apache-2.0.
Source: https://github.com/sayaka-aiart/StandRig/tree/d639ea5b123c37c1c3b7981b01b2cf64d3bd9e91

Debby bundles the unmodified browser renderer, facial controller and core
evaluation/validation modules with esbuild. The export-only entry and host adapter
are Debby code. No authoring service, tracker, upstream character art or Cubism SDK
is included. See LICENSE and provenance.json. Rebuild with
`node scripts/vendor-standrig.mjs <path-to-pinned-clean-checkout>`.
