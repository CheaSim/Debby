# 插画到桌宠：See-through × Anime2.5DRig

调研与接入验证日期：2026-10-27。

2026-10-31 更新：[StandRig 与内置鲸鱼娘表情立绘](standrig-whale-girl.md) 已接入同一角色工坊，支持导入自包含 `.srig`。鲸鱼娘当前使用完整立绘差分，不包含此页 PSD 后端的独立五官与口型能力。

两者适合组成「单张插画 → 分层 PSD → 自动绑定 → 桌宠实时驱动」的流程。这是一条 **2.5D 插画角色** 路线；原有 Three.js / VRM 负责完整 3D 视角与骨骼舞蹈。单张图片分层不会自动生成完整 3D 人体或舞蹈骨骼。

| 项目 | 核心技术与输出 | Debby 中的位置 |
| --- | --- | --- |
| [See-through](https://github.com/shitagaki-lab/see-through/tree/df019de5129d6c4b406587a14c3501669441a783) | Python 3.12、PyTorch 2.8 / CUDA 12.8、Diffusers / Transformers、LayerDiff 3D (SDXL)、Marigold 深度、SAM 分割、psd-tools；推理生成最多 23 类语义图层与 PSD | 可选的离线资产制作工具，通过 `integrations/see-through.mjs` 启动用户配置的 Python 环境；不进入 Electron 运行依赖 |
| [Anime2.5DRig](https://github.com/852wa/Anime2.5DRig/tree/7ddbd9943ea3152561b3dc8348fd752c850f3e95) | 原生 JavaScript、ag-psd、Web Worker、WebGL1 网格形变、自动语义绑定、弹簧物理、眼睛遮罩；上游另有 FaceMesh、OBS 与视频导出 | 固定版本的 PSD 解析、自动绑定、网格、遮罩、头发物理直接复用；Debby 控制动画输入、生命周期、声音与界面 |

Debby 没有载入上游编辑器的摄像头、麦克风、OBS 服务或 FaceMesh。2.5D 角色复用现有 TTS 播放振幅、上证指数心情，以及内置 pi / 外部 MCP 的稳定动作 ID。没有新增云模型调用或默认设备采集。

## 现在怎么用

1. 启动 Debby，在角色下方「更多（…）→ 角色工坊」进入。
2. 导入自己的分层 `.psd`，等待预览出现。可以看全身、试口型、触发小心意。
3. 点击「用这个角色陪我」，角色与选中状态保存在本机 IndexedDB，重新打开也会恢复。

工坊支持返回原来的 3D、保留已导入立绘、移除本机保存立绘。导入失败不会替换当前角色；运行时渲染失败回退到 3D。舞蹈播放期间临时使用 VRM，停止后恢复选中的 2.5D。2.5D 的 `greet / stretch / clap` 等动作映射为头部、表情及手臂图层形变，精细程度取决于 PSD 拆分质量；它们不是完整骨骼动画。

PSD 要求：RGB、8 bit、PSD v1（不支持 PSB），文件 ≤64 MB，画布 ≤2400 万像素 / 单边 ≤16384，≤256 层，图层展开总像素 ≤6400 万。也受设备 WebGL 纹理/视口上限约束。解析运行在独立 Worker，有取消与 90 秒超时。超大模型建议先缩小到 1024–2048 高度，并去掉背景、草稿和冗余隐藏层。

图层名支持 See-through 语义名称和 Anime2.5DRig 的日文/英文别名，例如 `face`、`front hair`、`back hair`、`irides`、`eyewhite`、`eyebrow`、`mouth_open`、`mouth_close`、`neck`、`topwear`、`handwear`。默认保留自动识别的左右眼与锚点。缺少闭眼/闭口差分时，Debby 用原创程序笔画补齐；高质量发布建议在 PSD 中绘制专属差分，并修补遮挡后的皮肤、发丝及轮廓。没有实现完整的锚点手工编辑器；精细绑定可以先在上游编辑器中检查，当前 Debby 导入 PSD 后重新自动绑定，不读取上游 settings JSON。

## 用 See-through 制作 PSD

先在独立目录按 [上游固定版本的安装说明](https://github.com/shitagaki-lab/see-through/blob/df019de5129d6c4b406587a14c3501669441a783/README.md) 安装 Python 3.12、匹配 GPU 的 PyTorch，以及上游 requirements。可使用有合适 GPU 的其他电脑生成 PSD，再将文件带回 Debby。不要把多 GB 权重或 Python 环境加入桌宠安装包。

```powershell
git clone https://github.com/shitagaki-lab/see-through.git D:/avatar-tools/see-through
git -C D:/avatar-tools/see-through checkout df019de5129d6c4b406587a14c3501669441a783
# 按上游文档安装 Python / PyTorch / requirements 后，在 Debby 根目录运行：
npm.cmd run avatar:decompose -- --repo D:/avatar-tools/see-through --python D:/envs/see-through/python.exe --input D:/art/character.png --output D:/art/debby-layers --check
npm.cmd run avatar:decompose -- --repo D:/avatar-tools/see-through --python D:/envs/see-through/python.exe --input D:/art/character.png --output D:/art/debby-layers --offload
```

`--check` 只检查 Python 包和可用 CUDA/ROCm；`--dry-run` 只输出计划，不运行模型。适配器用参数数组启动 Python（不经过 shell），设置子进程专用 PYTHONPATH，传入 `--save_to_psd --tblr_split` 保留分层与左右组件。支持 `--resolution 1024`、`--seed 42` 和 `--offload`，完成后返回本次新建/更新的 PSD 路径；Ctrl+C 取消。已有旧结果不会被当作本次成功。常规推理首次可能自动从 Hugging Face 下载权重。

上游给出的 1280 分辨率 bf16 显存参考为 12–16 GB，group offload 约 10 GB。量化与 block swap 是上游独立脚本，当前适配器接的是标准 pipeline；尚未包装这两条模式。本次开发机为 Windows / AMD RX 9070 XT，未安装 Python 3.12 与对应的 PyTorch GPU 环境，因此 **尚未在此机器完成真实单图分层推理**。已验证转换器的参数、真实子进程启动、输出收集、失败与取消；不要将其理解为已验证该显卡的 See-through 推理兼容性。

## 模块与集成

| 边界 | 实现 | 替换方式 |
| --- | --- | --- |
| 资产制作 | `integrations/see-through.mjs` | `buildSeeThroughJob` / `runSeeThroughJob` 是独立 Node 接口，可由其他 CLI 或任务系统调用 |
| PSD → Rig | `src/renderer/src/avatar/layered-runtime.ts` | 注入 `LayeredAvatarBackend.parse(Blob, { signal, progress })` |
| 持久化 | `src/renderer/src/avatar/layered-store.ts` | 注入 `LayeredAvatarStore.load/save`，可换宿主文件系统；桌面默认 IndexedDB |
| UI 状态 | `use-layered-avatar.ts` | `useLayeredAvatar(store, backend)`，只负责恢复、选择与保存，不包含 Agent 或 Key |
| 实时动作 | `src/shared/layered-avatar.ts` | `layeredParameters` 接受行情情绪、动作、口型、目光，输出数值参数；支持减少动态效果设置 |
| 渲染 | `LayeredPet.tsx` / `createLayeredDriver` | 输入普通 Rig 与数值参数；宿主负责 Canvas/生命周期，原有 MCP 协议不需要改 |

[无 React / Electron 的最小宿主示例](../examples/avatar/mount-layered-avatar.ts) 展示如何直接把 PSD 放进 WebGL canvas，并通过 `setInput({ mouth, mood, behavior })` 驱动。Debby 的透明 Windows 窗口额外将 WebGL 同帧复制到 Canvas2D，以维持已有的透明合成兼容性。预览确认会检查实际渲染 alpha 像素，不能只根据“文件读取完成”宣称角色可见。

## 来源与许可证

- Anime2.5DRig 固定提交 `7ddbd9943ea3152561b3dc8348fd752c850f3e95`，MIT。`public/vendor/anime25d/LICENSE` 保留原文，`provenance.json` 记录原始源码 SHA-256。`rigger.js / runtime.js / renderer.js / ag-psd.min.js` 原样复用；`debby-rig.js` 从 `app.js` 机械提取网格、形变和弹簧，去掉编辑器、OBS、采集，默认关闭胸部弹跳。`scripts/vendor-anime25d.mjs` 可从审核后的本机源码目录再生成，发布包不动态下载或执行远端 JS。
- ag-psd：MIT，版权说明保存在 `ag-psd-LICENSE`。
- [See-through](https://github.com/shitagaki-lab/see-through/blob/df019de5129d6c4b406587a14c3501669441a783/LICENSE)：代码 Apache-2.0；本仓库通过外部进程对接，没有复制其推理源码或权重。[模型卡](https://huggingface.co/layerdifforg/seethroughv0.0.2_layerdiff3d) 明确权重还继承 SDXL / Animagine / LayerDiffuse 的 Open RAIL 条款，不能用代码许可证代替权重许可证。
- 上游 README 明确示例 PSD 的画作权利属于各作者，因此没有将 sample PSD、通用图片差分或样例截图打包/提交。测试在内存中生成原创测试立绘；可选从忽略的 `work/` 读取开发者自行下载的固定版本样例做本机 QA。

## 验证

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:layered-avatar
```

E2E 检查坏 PSD 不替换现有角色、实际透明画布像素、试口型、动作、Agent 控制与取消、重载后保存恢复、切回 3D、舞蹈临时切换、移除与窄窗口布局。`DEBBY_TEST_UPSTREAM_PSD=1` 可额外使用 `work/upstream-anime-rig/sample2.psd` 验证真实样例；它不是必需测试依赖。
