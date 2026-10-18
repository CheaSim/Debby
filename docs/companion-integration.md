# 陪伴接入与扩展

当前实现是用户主动触发的 ASR → pi Agent → TTS，可附本轮照片，不是原生 Omni。行情表情、陪伴台词和播放嘴型独立，不能把指数涨跌解释为用户情绪。

## 模块契约

| 接口 | 文件 | 边界 |
| --- | --- | --- |
| `VoiceApi` / `VoiceState` / `VoiceTurn` | `src/shared/voice.ts` | 宿主命令、版本化状态和媒体事件 |
| `CompanionRuntime` / `CompanionOptions` | `src/main/companion/runtime.ts` | 会话、轮次、取消、授权、超时和事件 |
| `CompanionProvider` / `SpeechProvider` | 同上 / `qwen.ts` | ASR、pi StreamFn、TTS；由工厂注入 |
| `ConversationBackend` / `ConversationHost` | `src/shared/conversation.ts` | 与 pi、Electron 和供应商无关的外部 Agent 契约 |
| `CompanionCredentials` / `VoiceConfigStore` | `runtime.ts` / `config.ts` | 密钥存储、公开配置与官方端点验证 |
| `VoiceCapture` / `VoicePlayback` | `src/renderer/src/media/voice.ts` | 可复用采集和播放接口 |
| `useVoiceCompanion(enabled, api)` | `src/renderer/src/hooks/use-voice-companion.ts` | React 订阅、设备与页面生命周期 |
| `ReadAloudRuntime` / `useReadAloud(enabled, api)` | `src/main/companion/read-aloud.ts` / `src/renderer/src/hooks/use-read-aloud.ts` | 独立文字转语音，复用 `SpeechProvider.synthesize`，不依赖对话或采集会话 |
| `CameraPreview` / `DialoguePanel` | `src/renderer/src/components/` | 局部预览和 Galgame 对话外观 |

这是一组源码模块，不是独立发布的 npm SDK。主进程不依赖 React 或 Electron 类型，网络、加密、工具和事件由宿主注入。媒体采集只在浏览器层，Provider 不得主动开启设备。

```ts
import { CompanionRuntime } from './src/main/companion/runtime'
import { QwenGateway } from './src/main/companion/qwen'

const runtime = new CompanionRuntime({
  credentials: yourCredentialStore,
  createProvider: (config) => new QwenGateway(yourFetch, config, yourCredentialStore.getKey),
  tools: yourReviewedReadOnlyTools,
  onState: (state) => yourBus.emit('voice:changed', state),
  onAudio: (audio) => yourBus.emit('voice:audio', audio)
})
// Only after explicit user consent. Starting does not call a model or open a device.
const session = await runtime.start({ cloudConsent: true, camera: false })
await runtime.submit({ sessionId: session.sessionId!, text: '今天有点累。' })
await runtime.waitForIdle()
runtime.stop()
```

事件观察者不得保存原始媒体。`onAudio` 后源缓冲会清零，异步宿主需同步复制字节，使用后再清理。`submit` 只启动轮次，完成由状态或 `waitForIdle` 表达。每轮同时接受文字或音频之一；音频必须是 16kHz 单声道 16-bit PCM WAV，照片是有大小上限的 JPEG。Provider 必须遵守 AbortSignal，并自行限制响应大小、超时和重试。

替换 ASR/TTS 实现 `CompanionProvider` 并更换 `createProvider`，保留 pi 的 `DebbyAgentTransport`，不用重写 UI。原生实时 Omni 的持续会话协议需要额外适配，不声称仅换模型名即可支持。UI 可实现 `VoiceApi` 后注入 Hook；采集和播放接口允许独立替换，默认 Hook 使用浏览器实现。

只需让现有 Agent 的文字回复发声时，可单独使用 `ReadAloudRuntime`，不创建 `CompanionRuntime`：

```ts
import { ReadAloudRuntime } from './src/main/companion'

const speech = new ReadAloudRuntime(yourCredentialStore.publicConfig,
  (config) => new QwenGateway(yourFetch, config, yourCredentialStore.getKey))
const { bytes } = await speech.read({
  requestId: 'reply-1', text: '我把结果整理好啦。', cloudConsent: true
})
// Deliver bytes to VoicePlayback; clear the source after delivery.
speech.cancel() // Abort pending synthesis when the user interrupts.
```

每段上限 1200 字，不隐式截断；请求带关联 ID，替换或取消的迟到音频会丢弃并清零。桌面 `readAloud` / `cancelReadAloud` / `onReadAloudStop` 将合成、取消和窗口生命周期传给 `useReadAloud`。文字对话中的自动朗读由用户点击开启，只在完整回复后调用，离开对话关闭；原有通义陪伴继续使用自己的 TTS 流程。MCP 台词目前仍只负责文字展示，不会自动开启这个开关。

## 外部 Agent 壳子

Debby 的产品定位是可独立接入 Agent 的虚拟人壳子，内置 pi 是可选实现，不是外部 harness 必须采用的框架。Claude Code、Codex、DeepSeek harness 和 Kimi Code 应各自管理认证、工具、模型、记忆和执行权限，Debby 只负责用户授权的采集、台词、声音、动作和展示。

外部后端实现 `ConversationBackend`，用 `createConversation` 注入；`createSpeechProvider` 可独立注入 ASR/TTS，此时不需要 `DebbyAgentTransport` 或任何 pi 对话循环。可编译示例见 [ExternalReplyBackend](../examples/harness/external-reply.ts)，接受普通字符串或异步文本流，包含取消、错误脱敏和有限会话状态：

```ts
const runtime = new CompanionRuntime({
  credentials: yourSpeechCredentials,
  tools: [],
  createSpeechProvider: () => yourSpeechProvider,
  createConversation: (host) => new ExternalReplyBackend(host,
    ({ text, images, signal }) => yourHarness.reply({ text, images, signal }))
})
```

适配器回调是接入点，不是特定 CLI 的 SDK 封装；示例不会自动启动这些 CLI。跨进程的台词、任务和动作控制现已提供 [统一 MCP 与 loopback 接口](mcp-integration.md)，默认关闭、由用户启用，本机令牌鉴权、版本化协议、单个活动控制者和可取消任务。MCP 是独立的表现层入口，不会启动语音会话、绕过设备授权或让外部 Agent 打开摄像头；语音与多模态后端继续通过本页的 ConversationBackend 契约替换。

外部后端必须及时响应 AbortSignal，停止产生音频和事件，并在 `clear()` 清理它拥有的会话；照片只限本轮，不应进入外部长期记忆。宿主的安全策略高于模型输出，禁止让模型改变 BYOK、许可或运行可执行文件。

工具沿用 `DebbyToolPlugin` / `registerTools`，只加载审查后随应用编译的可信插件。插件不是沙箱，不能动态执行模型输出、下载脚本或随意访问文件。参见 [Agent 扩展](agent-integration.md)。

## 设备与数据

每次开始单独同意云端传输，摄像头默认不选中。IPC 验证主窗口、主框架和当前会话；设备初次授权需要用户动作产生的短时许可。Electron 后续缺少设备类型的检查只允许已获批准的活动采集，音频和视频授权独立，关闭设备或会话撤销许可。

录音最长 30 秒，超限丢弃；会话最长 15 分钟，无后台自动上传、自动重连或自动发言。离开对话、隐藏窗口、锁屏、休眠和退出都撤销授权并停止设备。当前轮次 ID 与取消代数屏蔽迟到的识别、模型回复和音频；停止同时清理 AudioContext、音频节点、Worklet、流和计时器。

画面只在用户发送时采样一张，本轮完成后移除，不在后续上下文重放。原始媒体不写磁盘，转写与回复仅存内存，结束清空；云端留存由供应商条款决定，不能承诺云端零留存。嘴型使用实际播放的 RMS，不以生成阶段冒充正在说话。

开发 `.env` 仅由 Electron 主进程读取，Git 忽略且不打包，明文文件应自行保护。BYOK 对话框保存后使用系统加密，不返回 Key；不保存同意状态、不内置共享 Key，不把密钥放在 VITE_* 变量。TLS 限官方端点，重定向禁止，错误不回显上游内容。

## 通义协议

默认文字 / 视觉模型 `qwen3.8-flash`，最大输出 512 tokens，`enable_thinking: false`。ASR 模型 `qwen-audio-3.0-asr-flash`；TTS 模型 `qwen-audio-3.0-tts-plus`，音色 `longanhuan_v3.6`。音色和模型是否开放取决于账户，不内置可用性保证。

Chat 使用配置的 `/compatible-mode/v1/chat/completions`。Token Plan 音频不是 Chat Completions：ASR 使用 `/api/v1/services/aigc/multimodal-generation/generation` 的 `input_audio`；TTS 使用 `/api/v1/services/audio/tts/SpeechSynthesizer`。适配器兼容直接二进制、JSON 内联 Base64 和官方结果地址，下载结果不发送 Key、不跟随重定向。当前结果地址白名单仅含实测北京桶，其他地域须单独核实后扩展。

2026-10-18 实测该 TTS 返回北京 OSS 桶的 HTTP 临时地址。适配器仅将这个已知官方主机的地址升级为 HTTPS 后下载，保留签名路径与查询，不发起 HTTP 下载，也不把临时 URL 交给渲染层。包含凭据、非标准端口、其他域名或协议的地址仍拒绝。

Token Plan 对自动化脚本、应用后端及共享 Key 有限制。用户主动触发并不自动保证所有桌面应用用途合规，公开发布或持续陪伴前须确认使用权限；不能以多 IP 绕过套餐、限额或收费。

## 测试与来源

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:voice-ui
npm.cmd run test:read-aloud-ui
```

领域测试覆盖真实 pi 循环、ASR/TTS 协议、关闭思考、密钥隔离、输入与响应上限、授权、取消及照片过期。桌面测试用隔离目录、虚拟摄像头和麦克风、模拟云端服务，检查真实录音 / 播放、嘴型、设备回收与窄屏像素；这些测试不能证明真实账户模型可用。

2026-10-18 使用本地 `.env` 做一次短句真实 TTS 验证：取得 53,851 字节音频，浏览器解码约 2.688 秒且非静音；没有调用文字模型或采集设备。可用 `npm.cmd run test:tts-live` 主动复验，样本只写入被忽略的 `work/`，不输出 Key 或临时 URL。

2026-10-09 另做少量人工触发真实验证：`qwen3.8-flash` 正确识别绿色测试色块，思考关闭；TTS 返回北京 OSS 临时音频地址，生成短中文语音后由 ASR 识别。未使用真实摄像头、麦克风或个人画面，也不把密钥和临时 URL 提交仓库。Windows 虚拟摄像头测试关闭 D3D11 采集以避开该环境的 NV12 服务崩溃，生产启动不修改这一系统选项。

参考日期：2026-10-09。

- [AAAAGENT](https://github.com/phoiex/AAAAGENT)，phoiex and contributors，参考提交 `4d1b08f9c8753189d51b55d270804fe1d50acb9f`：参考媒体、轮次和表现层划分，未复制源码或资产，独立实现，不暗示上游背书。
- AAAAGENT 使用自定义 [Noncommercial and Attribution License 1.0](https://github.com/phoiex/AAAAGENT/blob/main/LICENSE)，不是 MIT / Apache，非商用也不意味着可以忽略署名或再分发限制；其条款不被本项目 MIT 声明覆盖。
- [Token Plan 概览](https://help.aliyun.com/zh/model-studio/token-plan-team-overview)：模型能力、用途和账户边界。
- [Token Plan 多模态生成](https://help.aliyun.com/zh/model-studio/token-plan-multimodal-gen)：音频服务和音色格式。
- [Flash 录音识别 HTTP](https://help.aliyun.com/zh/model-studio/fun-asr-flash-recorded-speech-recognition-http-api)：ASR 原生协议。
- [OpenRouter 推理控制](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)：关闭推理与仅隐藏推理文本的区别。
