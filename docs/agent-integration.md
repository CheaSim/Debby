# Agent 与插件接入

Agent 模块不依赖 Electron。Electron 提供网络、加密与 IPC；React 订阅公开状态，不接触 SDK 或已保存的 Key。当前是源码可复用模块，不是已发布的 npm SDK。

## 接口定位

| 接口 | 文件 | 用途 |
| --- | --- | --- |
| `DebbyAgentRuntime` / `DebbyAgentOptions` | `src/main/agent/index.ts` | pi 循环、取消、会话与事件 |
| `DebbyToolPlugin` / `registerTools` | 同上 | 显式注册工具，拒绝重复插件与工具名 |
| `DebbyAgentTransport` | 同上 | 注入提供商，独立于 Electron 与 UI |
| `ChatCredentials` / `SecretCipher` | 同上 | 注入密钥存储与系统加密 |
| `ChatApi` / `ChatState` | `src/shared/chat.ts` | renderer / IPC / 宿主契约 |
| `useDebbyChat(api)` | `src/renderer/src/hooks/use-debby-chat.ts` | React 订阅清理、快照版本、命令错误 |
| `DialoguePanel` | `src/renderer/src/components/DialoguePanel.tsx` | 可替换对话外观，不负责模型调用 |

## 添加工具

参考可编译的 [上海时间插件](../examples/plugins/market-clock.ts)，在 `src/main/index.ts` 导入并注册：

```ts
import { marketClockPlugin } from '../../examples/plugins/market-clock'

const tools = registerTools([marketToolsPlugin, marketClockPlugin], {
  getMarket: () => ({
    quotes: market.getQuotes(), provider: market.getProvider(),
    providerName: market.getProviderName(), providerStatus: market.getStatus()
  }),
  requestQuotes: (url, init) => net.fetch(url, init)
})
```

将 `tools` 传给 Runtime，无需修改 agent 循环、preload 或面板。参数使用 TypeBox JSON Schema，pi 验证后执行；工具仍应验证领域约束。失败抛错，使用 AbortSignal，保留数据源时间。

插件是审查后随应用编译的可信代码，不是沙箱，拥有主进程代码的权限。不要动态运行下载脚本、用户输入或模型输出。默认三个只读行情工具，没有 shell、文件浏览、交易或任意 URL 请求工具。`requestQuotes` 供可信适配器调用固定行情端点，不能直接转发模型给出的 URL。

## 其他宿主

```ts
import { DebbyAgentRuntime, OpenRouterGateway, registerTools, marketToolsPlugin } from './src/main/agent'

const runtime = new DebbyAgentRuntime({
  credentials: yourEncryptedCredentialStore, // implements ChatCredentials
  transport: new OpenRouterGateway(yourFetch),
  tools: registerTools([marketToolsPlugin], yourMarketContext),
  onState: (state) => yourEventBus.emit('chat', state)
})
const unsubscribe = runtime.subscribe((state) => render(state))
await runtime.send('上证指数现在怎么样？') // starts streaming; events report completion
runtime.cancel()
await runtime.clear() // aborts and waits, then discards the in-memory session
unsubscribe()
```

Electron 用 `net.fetch` 继承应用代理；Node 宿主自行提供代理 fetch。替换提供商实现 `DebbyAgentTransport`，stream 使用 pi 的 StreamFn，不另写循环。自定义收费 transport 属于宿主显式决策，当前应用只接 OpenRouter 免费模型。

React 宿主实现 `ChatApi` 后调用 `useDebbyChat(yourApi)`，将结果交给 `DialoguePanel`，无需全局 window.finpet。ChatState.revision 丢弃订阅和初始化之间的陈旧快照，订阅返回取消函数。

## 安全与限制

- Key 在输入框短暂存在，保存后清空。主进程用 safeStorage 加密，Linux basic_text 被拒绝，没有明文降级。单独的 agent-credentials.json 不进入公开 AppSettings 或聊天事件。
- 会话仅内存保存，界面最多 32 条；上下文按完整用户轮次保留最近 8 轮并限制文本预算，不输出推理链。
- 默认 openrouter/free；每次新问题检查目录中的价格和 tools 支持，并设置提供商价格上限为零，不启用收费兜底或无限重试。
- 输入最多 4000 字，输出最多 1024 tokens，最多 4 个模型轮次 / 8 次工具调用，90 秒停止。修改配置需停止回复并清空会话，取消或失败轮次不当作完整上下文重放。
- 用户必须配置自己的 Key 并同意云端传输。免费供应商可能记录输入或训练模型，不发送账户、持仓、密码等敏感信息。渲染层演示场景暂停发送。
- 行情工具保留源日期、休市、离线和演示标记。工具验证不能保证模型结论正确，金融回答仍需核对。

## 验证

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run test:chat-ui
```

agent.test.ts 用本地 SSE 服务运行真实 pi 循环，覆盖工具、流式、取消、429、模型收费拦截与密钥隔离，不调用真实付费接口。Electron E2E 用隔离用户目录检查系统加密、同意闸门、画布像素及 880 x 620 / 390 x 740 布局。UI 状态测试使用合成台词，不宣称已验证云端生成。

真实生成需用户自己的 Key；连接验证仅调用 /api/v1/key，不生成文本。免费额度和可用性会变动，不以多 IP 或多账号绕过限制。

## 官方资料

核对日期：2026-10-07。

- [pi Agent API](https://github.com/earendil-works/pi/tree/main/packages/agent)：pi-agent-core / pi-ai 1.0.4，MIT；旧 badlogic/pi-mono 地址已重定向。
- [OpenRouter Free Router](https://openrouter.ai/openrouter/free)：零 token 费用，按工具等能力筛选。
- [账户与请求限额](https://openrouter.ai/docs/api_reference/limits)：402 / 429 和 Key 查询。
- [模型目录 API](https://openrouter.ai/api/v1/models)：运行时检查，不写死免费列表。
