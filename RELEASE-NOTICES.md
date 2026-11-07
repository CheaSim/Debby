# Debby preview distribution

Debby program code is MIT licensed; see LICENSE. Artwork and third-party components retain their own licenses. This bundled whale-girl edition is for noncommercial use.

## Whale girl (default character)

The community whale-girl illustrations and Debby layered derivatives are CC BY-NC-SA 4.0, requiring attribution, noncommercial use, and share-alike for adapted artwork. Credits: 上善 (original character), ZipZipPipe / zipzip (DeepSeek maid redesign), Small-tailqwq / dsh-deep-whale (maid-atelier artwork), JAdpp / dsh-whale-galgame (expression variants), Debby contributors (layer decomposition, retouching and rigs).

Full license, attribution chain, pinned sources and per-pose provenance are included in `app.asar/out/renderer/models/whale-girl/` and in the source repository. The character is community fan art and does not imply endorsement by DeepSeek or the artists. The layered character is 2.5D, not a complete 3D dance body.

## Separate 3D fallback / dance body

Unmodified VRM1_Constraint_Twist_Sample v1.0.1, (c) 2022 pixiv Inc., from vrm-c/vrm-specification at revision 94e82dd346fa6cf0337c4421728640e5252dd38e. VRM Public License 1.0: https://vrm.dev/licenses/1.0/ . Its embedded settings allow everyone to use the avatar, redistribution, and modification with redistribution; commercialUsage=corporation; creditNotation=unnecessary; allowAntisocialOrHateUsage=false. The linked license and embedded settings apply together. This model is not MIT or CC0. No pixiv endorsement is implied.

Source: https://github.com/vrm-c/vrm-specification/tree/94e82dd346fa6cf0337c4421728640e5252dd38e/samples/VRM1_Constraint_Twist_Sample

The default whale character and this 3D body are different assets. The 3D sample is used for skeletal dance playback or when the user selects 3D mode. Its hash and notice are included in `app.asar/out/renderer/models/vrm-sample/`.

## Other components

Anime2.5DRig, ag-psd and StandRig runtime notices and license texts are included in `app.asar/out/renderer/vendor/`. Pose-estimation asset notices are in `app.asar/out/renderer/mocap/`. Electron and npm dependencies retain their upstream licenses in the distribution and source dependency metadata.

Zome/Mate-Engine preview assets, Haru Live2D samples and the Cubism Core script are excluded from this installer. They may only be configured separately under their own terms. No account credentials, local `.env`, or local Agent connection token is bundled. Users supply their own model/voice keys; local MCP control and the local demonstration require no LLM key.
