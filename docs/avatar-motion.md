# 目光、待机与说话动作

## 交互效果

Debby 在桌面窗口外也会继续看向鼠标，移出角色后不再回正；支持鼠标穿透、窗口移动、负坐标显示器与 Chromium 缩放。眼神和头部各自平滑跟随，小幅转动并限制极限角度。隐藏或最小化窗口停止桌面指针轮询；只在坐标变化时发送位置，最多约 30 Hz，不抓取点击、键盘、屏幕或摄像头内容。

平静或开心时，空闲约 18 秒会点头，随后间隔约 22–30 秒轮换思考、舒展和害羞。待机动作遇到对话、Agent 接管、拖拽或舞蹈立即让出身体；摸头等主动互动仍具有优先级。担忧或断线时不随机插入开心动作。说话、倾听、思考和等待使用各自姿态；说话时头部与手臂轻微变化，嘴部仍由真实音频振幅独立驱动。动作调度使用实际经过的时间，低帧率不会把 18 秒拖成一分钟。

| 角色 | 目光 | 自动与说话动作 | 限制 |
| --- | --- | --- | --- |
| VRM / Zome | 原生 LookAt、眼球与头骨 | 骨骼待机、说话手势、倾听与工作姿态 | 具体表情取决于模型通道 |
| 分层 PSD / 普通 StandRig | 已绑定的头部和眼部参数 | 已绑定部件形变、真实音频口型 | 效果取决于图层及绑定 |
| 内置鲸鱼娘多立绘包 | 各张 PSD 的独立虹膜、眼白裁剪、脸部与头发形变；原本闭眼的插画保持闭眼 | 随语义切换原画、独立口型、发丝物理、身体与手臂；可调 0.6–2.4× 幅度 | 2.5D 插画形变，VRMA 舞蹈仍切换 3D |
| 旧鲸鱼娘 StandRig 包 | 旋转层级和 ArtMesh 蒙皮，眼部区域独立关节 | 头颈、躯干、头发与尾巴弹性跟随、待机/说话姿态 | 旧包没有独立五官贴图；闭眼立绘保持闭眼 |

角色工坊提供分层 PSD 的「试试口型」「查看拆分图层」，多立绘的逐张预览和「动作与幅度」，以及旧骨架包的「试试说话动作」「显示骨架」。动作默认 1.9×，放大摆头、身体摆动、抬手与远端手臂转动；拎裙子的手可保持连接。系统开启“减少动态效果”后停止待机、身体和发丝物理，保留表情与实际语音口型。原封未改的内置立绘/骨架包与单张 PSD 会在恢复时加载新角色包；通过 SHA-256 精确识别，改过的文件不会替换，原存储也不会被自动覆盖。多立绘文档见 [同角色表情组](expression-characters.md)。

## 旧包的骨架与蒙皮

基于 [StandRig 0.2.0 原生运行时](https://github.com/sayaka-aiart/StandRig/tree/d639ea5b123c37c1c3b7981b01b2cf64d3bd9e91)，固定上游源码，无编辑器服务依赖。骨架层级为 body-root → torso → neck → head；头发和每张立绘的眼部关节挂在 head 下，尾巴挂在 body-root 下。共 7 个共享关节及 14 个按表情独立的眼部关节；闭眼差分没有眼部关节。头部最大倾斜 ±4°，颈部 ±1.3°，头发 ±2.4°、尾巴 ±2°，视线只移动局部眼部网格。

每张姿态划分为共享顶点的网格片，每片遵守上游恰好三个蒙皮关节的约束，顶点权重归一化；片间共用边界的坐标和权重一致。脚部保留在根部，头动不带走脚。`createSkeletonMotion` 用宿主时钟及已滤波的视线输入，提供六个有界的自定义参数；头发和尾巴使用分步阻尼弹簧。运行时使用原生 `resolveRigFrame` 和 GPU 网格蒙皮，旧版图像形变只供旧角色包兼容使用。

这是在现有立绘上制作的 2D 骨架网格，不包含自动重绘遮挡区域或分离出的虹膜、眼睑和嘴部；小幅度适配用于避免暴露缺失绘画。See-through 是单独的拆图/补绘作者工具，Anime2.5DRig 继续处理用户导入的分层 PSD，已有 VRM 舞蹈保持原来的骨骼通道。

## 参考与取舍

参考 [animal-island-ui 的设计系统](https://github.com/guokaigdg/animal-island-ui/blob/1cdab9d45e3675082df381c3575b36c6743cb854/docs/design-system/design-rules.md)（2026-10-31 核查）：React / TypeScript / Less Modules / Vite，MIT；其圆润控件、柔和动效与短反馈适合陪伴产品。它是 UI 组件库，并不提供虚拟人的骨骼或目光系统。本次借鉴轻柔、克制的反馈节奏，保留 Debby 已有简约界面；没有引入整套主题、字体或新的运行时依赖。

## 可独立集成

`src/shared/avatar-gaze.ts` 不依赖 DOM、Electron 或 React。宿主提供一个 `CursorSource`，初始快照和后续订阅均传入**视口 CSS 像素**；`createAvatarGaze` 处理订阅清理与初始快照竞争，`read` 可随布局、取景和窗口移动重新计算方向。桌面适配在 main/preload，浏览器适配监听整个窗口的 `pointermove`，不会在角色 `pointerleave` 时清零。

```ts
const gaze = createAvatarGaze(myCursorSource)
// 宿主自己的帧循环；faceY 为脸部中心占角色容器高度的比例。
const direction = gaze.read(canvas.getBoundingClientRect(), .3)
avatar.setInput({ gaze: direction, behavior: 'talking', mouth: speechAmplitude })
// 卸载宿主时：gaze.dispose(); avatar.dispose()
```

渲染仍使用统一 `LayeredAvatarDriver.frame`。可选第五个参数 `{ behavior, reducedMotion, showSkeleton, hiddenLayers, pose }` 允许适配器消费动作语义、骨架、部件和立绘预览；旧的四参宿主继续可用。浏览器示例 [mount-layered-avatar.ts](../examples/avatar/mount-layered-avatar.ts) 额外暴露 `setSkeletonPreview(true)`。适配器不访问模型供应商、设备或 Electron。

可选 `metadata.debby.skeleton` version 1 包含 `jointIds`（至多 64 个原生 deformer ID）及 `poseParts`（表情 ID → 蒙皮部件 ID 数组）；导入时验证引用、数量和版本。运动参数与关节的具体绑定保存在标准 `.srig` 内，宿主不需要了解网格拓扑。作者适配器 `integrations/portrait-skeleton.mjs` 是无 IO 的纯函数，可复用或为其他人物编写独立 profile；`npm run avatar:rig` 可重现内置角色与哈希记录。

旧包的可选 `metadata.debby.motion` version 1 包含舞台像素单位的 `head`（x/y、radiusX/Y、pivotX/Y）和 `eyes`（表情 ID → 至多两个眼部椭圆）。导入时检查版本、数值、数量与画布边界；不执行模型里的代码。兼容渲染器 `createPortraitMotion` 仅处理没有 skeleton 元数据的旧包；不会叠加到原生蒙皮之上。

## 后台验证

```powershell
npm.cmd run test:avatar-motion
npm.cmd run test:avatar-skeleton
$env:FINPET_E2E_BACKGROUND='1'
node tests/standrig-avatar.e2e.mjs
node tests/layered-avatar.e2e.mjs
```

动作 E2E 默认使用独立临时用户目录：窗口隐藏、不可聚焦、静音，使用 [Electron 离屏渲染](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering)以 30 FPS 驱动，避免普通隐藏窗口降到约 1 FPS 后漏掉短姿态；通过注入测试进程的只读鼠标坐标验证 native → IPC → 渲染路径，**不会移动系统鼠标**。旧 E2E 可用上述环境变量进入同一后台模式。测试不改正常用户配置，不打开设备，不调用真实模型或音频供应商。测试完成删除本次临时用户目录。

数值测试覆盖全部 64 组关节极限组合、基准姿态还原、共享边界一致、权重归一及三角形不翻转。真实美术像素检查覆盖原图方向/颜色/透明度、左右眼部像素变化及身体隔离；界面检查窗口外跟随、缩放、穿透、骨架开关、待机转说话、减少动态效果及无焦点/声音。

实际渲染及测量保存在被忽略的 `work/avatar-skeleton/`：`skeleton-contact.png`（左/原位/右/呼吸/骨架）、`face-extremes.png`、`attachment-extremes.png`、`measurements.json`。这些是网格适配的数值和视觉证据，并非宣称获得了 StandRig 完整分层 PSD 的 Model Freeze。
