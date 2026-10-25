# Local video pose recognition

MediaPipe Tasks Vision **0.10.32**, Google, Apache-2.0. WASM and its loader are copied from the pinned npm package during setup. The upstream license is preserved beside this file as `LICENSE`, and is copied into the renderer build with these assets. Source: https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE

Pose Landmarker Full, float16, **version 1**, from Google's official model index:
https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task

SHA-256: `5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1`.

Official model documentation and model card:
https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf

The BlazePose GHUM 3D model card lists Apache License 2.0. Model and software provenance checked 2026-10-25. `@pixiv/three-vrm-animation` 3.5.5 is MIT: https://github.com/pixiv/three-vrm/blob/release/LICENSE . No third-party choreography or source video is bundled. The included 8-second routine consists of original Debby keyframes.

Generated WASM/model binaries and the bundled classic Worker are ignored by Git. `npm run dance:setup` restores them. The worker is bundled with pinned esbuild for both dev and production, since the MediaPipe Emscripten loader uses `importScripts` (unavailable in module workers). After editing `pose.worker.ts`, run setup again and refresh the renderer. Inference runs locally; source video is neither uploaded nor retained in the motion library.
