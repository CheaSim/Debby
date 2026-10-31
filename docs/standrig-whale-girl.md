# 鲸鱼娘角色与 StandRig 接入

来源核查：2026-10-31。角色外观仍由 Debby 的金融陪伴人格驱动，外观不绑定底层 LLM。

## 现在可以用的内容

桌宠选项 → 角色工坊 →「遇见鲸鱼娘」→ 预览表情 →「用这个角色陪我」。默认上半身，可切全身；保存到本机后重启恢复。对话、语音、Agent 的同一套 `AvatarPerformance` 驱动表情，指数上涨触发开心，下跌使用关心表情。控制取消/表情到期后恢复当前心情。舞蹈继续使用现有 VRM，停止后恢复鲸鱼娘。

素材来自 [JAdpp/dsh-whale-galgame](https://github.com/JAdpp/dsh-whale-galgame/tree/046b848f244450e6e636335766276bf3343fe84b)，采用八张不同姿态的透明立绘，映射到九个语义表情（俏皮复用开心）。这不是新生成的原画，也不是分层五官模型。当前角色包支持立绘表情切换和轻微漂浮，没有独立眨眼、目光或语音口型，更不是 3D。后续有真正分层 PSD 后再做精细绑定；现有 PSD 后端不受影响。

## 技术判断与复用范围

[StandRig 0.2.0](https://github.com/sayaka-aiart/StandRig/tree/d639ea5b123c37c1c3b7981b01b2cf64d3bd9e91) 使用 TypeScript 5.9 / Vite 8，按 core、runtime、contracts、service、preview、MCP 拆分。PSD 解析依赖 ag-psd，运行时提供 Canvas2D 与可选 WebGL 网格渲染。代码为 Apache-2.0。

它是作者工具与独立播放器，不负责画原画、自动拆分图片或生成 VRM/Cubism moc3。浏览器编辑器导入分层 PSD（至少两层图像），模型可导出内嵌 PNG 的 `.srig`，也可导出 `standrig-bundle`。原生 motion JSON 与 VRMA、Live2D motion3 格式不同，不能互换。`exp3` 仅交换表情参数，不能转换角色模型。

Debby 固定版本复用 `RigRuntime`、`FacialController`、参数定义、迁移与模型验证。浏览器构建不包含服务、MCP、摄像头、OBS 或 PSD 编辑器；无须后台编辑器进程。上游完整工程已在本机 `work/upstream-standrig` 通过 `npm ci --ignore-scripts` 和 `npm run build`。编辑器需 Node 22.12+ 或 24+，服务默认本机 5180；Debby 的正常播放不依赖该端口。

## 集成边界

| 层 | 实现 | 扩展方式 |
| --- | --- | --- |
| 导入 | `PortableAvatarBackend` | 识别 PSD / srig，worker 中校验，可取消/超时 |
| 文件策略 | `portableStandRig` | 64 MB 文件；限制结构深度/节点数；仅内嵌 PNG，按真实 PNG 头限制解码像素 |
| 模型校验 | 上游 `migrateRigDocument` / `validateRig` | 拒绝不支持版本、悬空引用、无效表情等 |
| 渲染 | `createLayeredSurface` | 根据模型选 Anime2.5D 或 StandRig，可单独用于 Web 宿主 |
| 输入 | `standRigParameters` / `AvatarPerformance` | 声音与表情分离，保持现有 MCP 和 Agent 接口 |
| 持久化 | `LayeredAvatarStore` | 原有 IndexedDB；可注入其他存储，无需提供者或 Electron 依赖 |

精细模型可在 `facialPresets.expressions` 注册与 Debby 一致的 neutral/happy/caring/sad/shy/surprised/curious/playful/proud ID。缺少预设时使用标准参数映射。带独立嘴部绑定的模型由实时音频振幅控制 `ParamMouthOpen/ParamMouthOpenY`，表情不覆盖该通道。表情立绘使用 `metadata.debby.mode = "portrait-poses"`，整张切换避免多个人物叠影；`metadata.debby.face` 可设置上半身取景的舞台像素范围。

[最小浏览器宿主](../examples/avatar/mount-layered-avatar.ts) 可直接传入 PSD / srig 的 Blob，得到 `setInput`、`setExpression` 和 `dispose`。调用 `setExpression({ emotion: 'shy', intensity: .7 })` 即可驱动同一套角色，不依赖 Debby 的 React 界面、pi 或任何模型供应商。发布构建同时保留 `public/vendor/standrig/` 中的 Apache 许可与原始 NOTICE。

## 后续精细绑定

先取得真正分层的五官、头发、颈部、衣服、手臂与鲸尾素材；保留遮挡后的绘画覆盖。按上游 [AI 操作指南](https://github.com/sayaka-aiart/StandRig/blob/d639ea5b123c37c1c3b7981b01b2cf64d3bd9e91/AI_OPERATING_GUIDE.md)，PSD 建模前须有实际的脸部极限角度、全身极限角度、连接覆盖三张目标图及来源哈希、参数范围和视觉验收记录。然后按区域 dry-run → 数值 QA → checkpoint → commit → 实际极限姿态视觉检查，不能把一张扁平立绘改名 PSD 当作完成绑定。

## 许可、复现与验证

代码仍为 MIT；StandRig 运行时为 Apache-2.0，许可证和源码哈希保存在 `src/renderer/src/avatar/vendor/standrig/`。鲸鱼娘角色包及其衍生美术为 CC BY-NC-SA 4.0，完整署名链是 上善 → ZipZipPipe → Small-tailqwq → JAdpp → Debby 适配。原协议、上游 notices、原图哈希与修改记录保存在 `public/models/whale-girl/`，不可按代码的 MIT 许可使用这些美术。

```powershell
node scripts/vendor-standrig.mjs work/upstream-standrig
node scripts/prepare-whale-girl.mjs work/upstream-whale-galgame
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
node tests/standrig-avatar.e2e.mjs
node tests/layered-avatar.e2e.mjs
```

图片准备仅进行机械格式转换与边缘残留清理，并记录像素修改数量。`work/whale-girl/expressions.png` 是实际素材拼图；发布前需要检查透明边缘、服饰细节及取景。E2E 直接使用打包的真实角色，验证导入、可见像素、表情像素变化、重载、拖拽、MCP 表情、取消、舞蹈回退与停止恢复。它不能证明尚不存在的精细口型/3D 绑定已经完成。
