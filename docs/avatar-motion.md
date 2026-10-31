# 目光、待机与说话动作

## 交互效果

Debby 在桌面窗口外也会继续看向鼠标，移出角色后不再回正；支持鼠标穿透、窗口移动、负坐标显示器与 Chromium 缩放。眼神和头部各自平滑跟随，小幅转动并限制极限角度。隐藏或最小化窗口停止桌面指针轮询；只在坐标变化时发送位置，最多约 30 Hz，不抓取点击、键盘、屏幕或摄像头内容。

平静或开心时，空闲约 18 秒会点头，随后间隔约 22–30 秒轮换思考、舒展和害羞。待机动作遇到对话、Agent 接管、拖拽或舞蹈立即让出身体；摸头等主动互动仍具有优先级。担忧或断线时不随机插入开心动作。说话、倾听、思考和等待使用各自姿态；说话时头部与手臂轻微变化，嘴部仍由真实音频振幅独立驱动。动作调度使用实际经过的时间，低帧率不会把 18 秒拖成一分钟。

| 角色 | 目光 | 自动与说话动作 | 限制 |
| --- | --- | --- | --- |
| VRM / Zome | 原生 LookAt、眼球与头骨 | 骨骼待机、说话手势、倾听与工作姿态 | 具体表情取决于模型通道 |
| 分层 PSD / 普通 StandRig | 已绑定的头部和眼部参数 | 已绑定部件形变、真实音频口型 | 效果取决于图层及绑定 |
| 内置鲸鱼娘 | 每张立绘标注眼部区域，轻量图像空间视线与头部形变 | 呼吸、点头、姿态差分、说话时的小动作 | 无独立嘴部或骨骼；闭眼立绘保持闭眼 |

角色工坊提供「试试说话动作」或「试试口型」，可先预览再应用。系统开启“减少动态效果”后，鲸鱼娘停止图像形变，保留当前表情。原封未改的旧版内置鲸鱼娘会在恢复时使用新包；通过 SHA-256 精确识别，用户改过的文件与自导入文件不会替换，原存储也不会被自动覆盖。

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

渲染仍使用统一 `LayeredAvatarDriver.frame`。可选第五个参数 `{ behavior, reducedMotion }` 允许适配器消费动作语义；旧的四参宿主继续可用。浏览器示例见 [mount-layered-avatar.ts](../examples/avatar/mount-layered-avatar.ts)。

鲸鱼娘的可选 `metadata.debby.motion` version 1 包含舞台像素单位的 `head`（x/y、radiusX/Y、pivotX/Y）和 `eyes`（表情 ID → 至多两个眼部椭圆）。导入时检查版本、数值、数量与画布边界；不执行模型里的代码。`createPortraitMotion` 是独立的 WebGL 图像形变器，纹理只在表情切换时上传，头部与眼部采用有界的局部遮罩，不拉扯衣服，不合成嘴巴或不存在的五官。缺少 WebGL 时保留静态立绘。该适配不等同于分层 Live2D 或 3D 模型。

## 后台验证

```powershell
npm.cmd run test:avatar-motion
$env:FINPET_E2E_BACKGROUND='1'
node tests/standrig-avatar.e2e.mjs
node tests/layered-avatar.e2e.mjs
```

动作 E2E 默认使用独立临时用户目录：窗口隐藏、不可聚焦、静音，使用 [Electron 离屏渲染](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering)以 30 FPS 驱动，避免普通隐藏窗口降到约 1 FPS 后漏掉短姿态；通过注入测试进程的只读鼠标坐标验证 native → IPC → 渲染路径，**不会移动系统鼠标**。旧 E2E 可用上述环境变量进入同一后台模式。测试不改正常用户配置，不打开设备，不调用真实模型或音频供应商。测试完成删除本次临时用户目录。

真实美术像素检查覆盖原图方向/颜色/透明度、左右眼部像素变化及身体不受眼部形变影响；界面检查窗口外跟随、缩放、穿透、待机转说话、减少动态效果及无焦点/声音。实际左右对照图保存在被忽略的 `work/avatar-motion/gaze-contact.png`，仍需目视审查角色脸部是否自然。
