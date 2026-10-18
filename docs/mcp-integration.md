# 用同一套 MCP 驱动 Debby

Debby 是表现层，你的 Agent 负责推理、执行和停止任务。内置 pi、模型 Key、行情、语音与外部 Agent 控制分别独立。MCP 不需要 LLM Key，也不经过云端。

## 三步运行

1. 在项目目录 `npm.cmd install`，然后 `npm.cmd run dev`。需要 Node.js 22.19+，并让 MCP 客户端能够找到 `node`。
2. Debby 的「更多 → Agent 接入」中开启「允许本机 Agent 接入」，点击「复制 MCP 配置」。展开和桌宠模式的更多菜单都有入口。
3. 选择客户端格式：通用 JSON 用于支持 `mcpServers` 的客户端；Codex 选择 TOML。复制后合并配置，重新加载该客户端的 MCP 连接。将 `--name` 后的显示名改成 `Claude Code`、`DeepSeek Harness` 或其他名称。Debby 不会修改客户端配置。

复制得到的结构如下，实际路径由 Debby 自动生成：

```json
{
  "mcpServers": {
    "debby": {
      "command": "node",
      "args": [
        "C:/path/to/finpet/scripts/debby-mcp.mjs",
        "--connection", "C:/Users/you/AppData/Roaming/finpet/agent-bridge.json",
        "--name", "My Agent"
      ]
    }
  }
}
```

配置中没有令牌。不要提交、分享实际的 `agent-bridge.json`，也不要把内容放入提示词。源码目录移动后重新复制配置。

### Codex

选择「Codex · TOML」后复制，将 `[mcp_servers.debby]` 块合并到自己的 `.codex/config.toml`，替换已有同名块，不覆盖其他配置。也可以用 CLI，路径替换为复制配置中的实际路径：

```powershell
codex mcp add debby -- node "C:/path/to/finpet/scripts/debby-mcp.mjs" --connection "C:/path/to/agent-bridge.json" --name "Codex"
codex mcp list
```

上述 STDIO command/args、TOML 与 CLI 方式按 [OpenAI 官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) 核对于 2026-10-18。客户端必须在 Debby 所在的本机运行；远程主机、WSL、云端的回环地址与文件路径不自动等同于 Windows 本机。

可以让 Agent：

> 使用 Debby MCP 展示你的任务。先读取状态，为新任务生成唯一 taskId。开始时 set_task working，阶段进展时更新 progress，等我决定时 waiting。用 say 简短汇报，完成后 completed 并 celebrate。定期读取 get_state，如果状态 cancelled，停止你自己的任务。最后 release。

## 工具契约

| 工具 | 输入 | 效果 |
| --- | --- | --- |
| `debby_get_state` | `{}` | 当前控制者、任务、取消状态、台词与能力；读取不抢占 |
| `debby_set_task` | `taskId, title, status, progress?` | working / waiting / completed / error；progress 为 0–1 |
| `debby_say` | `taskId, turnId, text, append?, done?` | 纯文本台词，默认 done=true；不会自动调用语音供应商 |
| `debby_animate` | `taskId, name` | greet / celebrate / comfort / notify |
| `debby_release` | `{}` | 清空自己的控制状态，让其他 Agent 接入 |

先 set_task，再 say/animate。每个任务使用新 taskId，任务结束后不能重启旧 ID。流式台词首段 `done:false`，后续同 turnId 设置 `append:true`，最后 `done:true`。每段和拼接总长最多 2000 字符；气泡显示摘要，点击查看全文。

同一时刻只有一个控制者；其他客户端得到冲突错误。用户在桌宠里「取消任务」后，该任务的迟到消息会被拒绝。**取消是协作信号，实际执行由外部 Agent 停止**：长任务至少每几秒调用 get_state，并把 cancelled 转发自己的 AbortController/子进程停止逻辑。MCP 服务不会替 Agent 杀进程或批准执行。

断开连接、MCP 进程退出、锁屏或休眠会释放控制。旁车每 30 秒续租，120 秒无心跳释放；意外强制杀进程最多保留至租约过期。每个会话最多 256 个任务，每个任务最多 256 段台词，达到上限创建新会话/任务。

## 自定义 Harness：无需 MCP SDK

可直接复用零框架依赖的 [DebbyClient](../integrations/client.mjs)：

```js
import { DebbyClient } from './integrations/client.mjs'
const debby = new DebbyClient(connectionFilePath, 'My Harness')
try {
  await debby.setTask('unique-task-1', '正在检查项目', 'working', 0.2)
  await debby.say('unique-task-1', 'turn-1', '交给我吧。')
  // During work: await debby.getState(); forward cancellation to your execution layer.
  await debby.setTask('unique-task-1', '检查完成', 'completed', 1)
  await debby.animate('unique-task-1', 'celebrate')
} finally {
  await debby.release()
}
```

可运行例子（不调用模型）：

```powershell
node examples/agent-shell.mjs "复制配置中 --connection 后的完整路径"
```

「体验一下」是独立本地演示，明确标记无真实任务。进入 waiting 后只在用户点「继续演示」时完成。

## 分层与扩展

- `src/shared/shell.ts`：框架无关的 UI 状态和预加载 API。
- `src/main/bridge/runtime.ts`：单控制者、任务/台词生命周期、取消、租约与动作状态机；注入时钟和 onState Hook。
- `src/main/bridge/server.ts`：回环 HTTP 适配器、权限和连接文件生命周期。
- `integrations/client.mjs`：可复用 Harness 客户端，负责序号、心跳与释放。
- `integrations/mcp-server.mjs`：官方 MCP SDK 工具适配器；stdio 入口位于 `scripts/debby-mcp.mjs`。
- `use-agent-shell.ts`、`AgentConnectionDialog.tsx`、`ThreeDPet.tsx`：可替换的 React 和 3D 表现层。工作专注、等待歪头、完成庆祝；用户拖拽与摸头优先，指数心情单独计算。

外部对话后端替换参见 [Agent 接入](agent-integration.md) 与 [陪伴模块](companion-integration.md)。MCP 是另一个接入口，不要求替换内置后端。

## 本地连接边界

默认关闭，每次启动需要用户开启。HTTP 只绑定 `127.0.0.1` 随机端口，所有路由要求随机 bearer token，拒绝浏览器 Origin 和错误 Host；不监听局域网。连接文件仅保存在用户数据目录，关闭时删除，重新开启更换令牌。Unix 文件权限 0600，Windows 继承用户目录 ACL。令牌不返回渲染层。

状态与台词只驻内存。控制接口不暴露 Key、原始行情、自定义网络请求、文件读写、任意脚本、摄像头或麦克风；金融数据工具仍由独立的 Agent 插件提供。每秒最多 60 次认证请求，正文最多 16 KiB，同时最多 16 个连接。主机上能读取用户目录的其他进程仍属于用户自身的信任范围。

当前为源码运行版接入。NSIS 发布仍受现有 Zome 模型分发许可检查限制，尚未提供安装包内独立 Node 旁车。验证使用官方 MCP 客户端执行真实 stdio 握手和工具调用；不等同于逐个客户端产品完成配置验收。

## 验证

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:agent-shell
```

协议实现使用 [官方 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) 的 server/client 2.3.1；支持旧版 initialize 和现代 discover 连接入口。stdio stdout 只写 MCP 数据，诊断写 stderr。
