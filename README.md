# Debby 金融桌宠

Debby 的全称是 **Daily Equity & Balance Buddy for You**，取 Daily / Equity / Balance / Buddy / You 的首字母，寓意“每天陪你看行情、守住资产节奏的小伙伴”。

Debby 是一个 Windows 优先的可爱风本地桌面伴侣。它以透明、无边框、置顶窗口常驻桌面，用桌宠状态表达自选行情，并提供可展开的行情与价格提醒工作台。内部工程名、IPC 和环境变量继续保留 `finpet / FINPET_*`，避免破坏已有配置。

> 默认本机获取腾讯公开 A 股行情，新浪自动备用。公开接口可能延迟、变更或限流，不构成投资建议，也不代表获得行情再分发授权。

## 已实现

- 透明无边框桌宠窗口、置顶、拖动、托盘、鼠标穿透和位置记忆
- 保留 Live2D Cubism 4 渲染组件，默认使用以下 3D 桌宠
- 默认加载 Mate-Engine 的 Zome VRM 3D 角色，保留完整服装、贴图、Toon 材质与头发物理
- 眨眼、视线跟随、待机呼吸、摸头回应、提起/落地、招呼、开心、安慰与提醒动作；使用 Three.js 动画混合器过渡
- 拖动移动窗口、独立旋转模式、滚轮缩放、全身/近景视图和视角复位
- 可选 Mate-Engine 旁车运行时：直接使用官方 Unity 3D/VRM 桌宠能力，不把大体积二进制提交到仓库
- `idle / bullish / bearish / alert / offline` 五态行情表情
- 心情跟随上证指数：+0.15% 及以上开心、-0.15% 及以下担忧；退出阈值为 +/-0.08%，避免边界附近反复变脸，个股选择不改变指数情绪
- 简约浅灰双栏工作台、行情/提醒分段视图、自选切换、实际采样价格和涨跌状态
- 桌宠仅保留面板和更多两个常驻按钮；视角、旋转、穿透收进菜单，声音/置顶/启动/行情源统一进入偏好设置
- 突破/跌破提醒、五分钟冷却、系统通知和本地持久化
- 默认公开 A 股行情、腾讯/新浪自动切换、休市状态、真实行情时间和本地离线缓存
- 可切换演示行情、自定义 WebSocket 中继；不把模拟数据混入真实行情
- 可控场景演示：上涨、下跌、提醒、断线、收盘；播放/暂停/重播，默认每 12 秒切换一场，共 60 秒
- 行情/收盘快照复盘卡、PNG 图片导出和文字复制，保留数据日期、来源、模拟与缓存标记
- 单实例、后台开机启动、正式应用/托盘图标
- `contextIsolation + sandbox + CSP + 白名单 IPC` 安全边界
- Windows NSIS 打包配置、领域测试和浏览器预览模式
- Galgame 对话：角色近景、姓名牌与流式台词、会话回看、停止回复与新会话
- pi Agent、只读行情工具、OpenRouter 免费模型路由、BYOK 与云端传输确认
- 可独立集成的 Agent、工具插件、React Hook 和 [扩展接入文档](docs/agent-integration.md)

## 开发

需要 Node.js 22.19 或更高版本。Windows PowerShell 若禁止执行 `npm.ps1`，使用 `npm.cmd`。

```powershell
npm.cmd install
npm.cmd run assets
npm.cmd run dev
```

### 对话与 BYOK

进入面板“对话”，在 BYOK 中填自己的 OpenRouter Key 并同意云端传输。默认 `openrouter/free` 只选免费模型，也可刷新并选择零费用且支持工具的模型；不会自动切收费模型。免费仍有账户额度、限流与可用性约束，不内置共享 Key。连接验证仅查询 Key 状态。

Key 经系统加密保存，不返回渲染层；会话只留内存。供应商可能记录输入或训练模型，避免敏感信息。浏览器预览不连接模型，在桌面版配置。对话设置也能从标题栏“更多 > BYOK”进入。

Galgame 台词支持流式、停止、会话回看和新会话。Agent 可以读指数/自选、查询沪深证券、解释数据来源，不下单或执行脚本。第三方集成见 [插件与 Hook](docs/agent-integration.md)。

### 默认 3D 角色

`npm.cmd run dev` 首次启动会下载约 26 MB 的 Zome 模型，之后使用经过校验的本地缓存。主窗口直接用 Three.js + `@pixiv/three-vrm` 显示角色，无需安装 Unity 或下载完整的 Mate-Engine 运行包。构建前也会自动检查模型。

模型来源、固定版本、内容校验值和作者署名见 [模型来源](src/renderer/public/models/mate-engine/SOURCE.md)。模型仅用于本机非商用预览，被 Git 忽略；含该模型的本地构建也不要单独再分发。

默认拖动角色会移动桌宠并保存位置；气泡和工具栏移动图标也可拖动窗口。
工具栏“更多”或右键桌宠打开角色菜单，可切换全身/近景视图。开启旋转模式后，拖动只旋转角色，不移动窗口；菜单中的复位按钮还原视角。
开启鼠标穿透后，角色区域不拦截桌面操作，工具栏和已打开的角色菜单仍可点击关闭穿透或打开行情面板。
托盘菜单也能关闭穿透。

### 可选 Mate-Engine 官方独立运行时

Mate-Engine 是 Unity 运行时，不能作为 React 组件直接嵌进 Electron。Debby 提供非商用本地旁车模式：安装脚本从 Mate-Engine GitHub Releases 下载公开 ZIP 到被 Git 忽略的 `work/mate-engine-runtime`，然后通过 Debby 托盘启动或关闭 `MateEngineX.exe`。

默认使用上游仓库里的 `Zome.vrm` 案例，安装后保存到 `work/mate-engine-runtime/cases/Zome.vrm`，并通过独立 profile 自动选中；它不会被提交到 Git。

```powershell
npm.cmd run mate-engine:setup
npm.cmd run dev
```

安装包约 831 MB，首次下载需要一些时间。Mate-Engine 的源代码、许可证和默认资产仍受上游条款约束；请只在非商用环境使用，并保留上游许可证与署名。这个独立窗口是可选功能，不影响主窗口直接显示 Zome 角色。

验证：

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run test:live
npm.cmd run build
```

Windows 安装包命令（当前模型许可未解决，检查会阻止打包）：

```powershell
npm.cmd run package:win
```

本地开发与 `build` 不受影响。发布前必须替换默认模型、下载脚本与构建资源为明确允许再分发的资产；不要绕过检查发布含 Zome 的安装包。现有 Haru/Cubism 资产也需要独立审查。

### 互动、演示与复盘

点击模型头部会触发摸头回应，点击身体会打招呼。拖动超过 5 像素后进入提起动作，松开后落地；旋转模式不触发提起。动作切换约 0.24 秒混合，行情反应有 8 秒冷却，用户互动优先。

面板标题栏“更多”菜单进入场景演示和偏好设置，“行情 / 提醒”分段按钮切换工作视图；支持左右方向键切换、Escape 关闭菜单和对话框。视觉参考 [Apple 工具栏](https://developer.apple.com/design/human-interface-guidelines/toolbars) 和 [材质规范](https://developer.apple.com/design/human-interface-guidelines/materials)，使用原生字体、浅灰侧栏、细分隔线与克制的半透明菜单，不模拟整套 macOS 窗口。

演示可选择场景或播放完整序列，退出立即回到原行情源。场景数据仅存在渲染层：不写入行情缓存，不切换真实供应商，不修改实盘提醒或自选选择，不触发系统通知。真实行情订阅仍继续，已配置的真实提醒不被暂停。收起面板后保留演示控制栏；开启穿透时该控制栏仍可操作。

标题栏的笔记图标打开复盘。只有指数被数据源标记为休市、且行情时间在上海时间 15:00 之后，才标记为“收盘快照”；午间和盘中显示“行情快照”。日期始终使用源行情日期，不把节假日缓存改写成今天。复盘是手动打开时的固定快照，仅纳入同日期、与指数时间相差不超过 60 秒的已获取标的，不是全市场涨跌统计，也不是完整历史日线档案。

PNG 最多列出 8 个标的并标明展示数量；复制文字包含快照内全部标的。演示导出保留“演示数据 · 非实盘”，离线或延迟缓存也有标记。

代表作方向、竞品参考和发布验收见 [产品路线与交付标准](docs/product-roadmap.md)。

## 接入真实行情

无需账号和 Token，默认主进程直接批量获取自选沪深行情，并始终包含上证指数作为心情依据。交易时段约 10 秒一次，休市约 60 秒一次；失败退避到最长 120 秒。缓存保留原行情时间，断线明确标记离线。默认包含上证指数、深证成指、创业板指与贵州茅台，不提供美股行情。

在面板“更多 > 偏好设置 > 行情源”选择公开行情、演示行情或自定义中继。价格曲线仅展示实际采样，不伪造历史分时线；首次休市启动只显示最新收盘价。

若使用行情中继，可以在面板中保存 WSS 地址，或者启动前设置环境变量：

```powershell
$env:FINPET_MARKET_WS="wss://your-licensed-relay.example/ws"
npm.cmd run dev
```

服务端可推送单个 `QuoteTick` 或 `QuoteTick[]`：

```json
{
  "symbol": "600519.SH",
  "name": "贵州茅台",
  "price": 1721.0,
  "previousClose": 1700.0,
  "change": 21.0,
  "changePct": 1.24,
  "timestamp": 1785931200000,
  "status": "open",
  "sparkline": [1700.0, 1704.2, 1721.0]
}
```

行情供应商密钥应保留在中继服务，不能发送到 Electron 渲染层。远程服务还应负责权限、限流、交易时段、断线补偿和延迟等级。

本地中继联调：

```powershell
npm.cmd run relay:demo
```

然后选择“自定义 WebSocket 中继”并填写 `ws://127.0.0.1:8787`。完整契约见 [行情中继协议](docs/market-relay-protocol.md)。免费 A 股数据源、集合库及当前实测记录见 [A 股数据源调研](docs/a-share-data-sources.md)。

## 目录

```text
src/main       Electron 主进程、窗口、托盘、行情与提醒
src/preload    最小化 contextBridge
src/renderer   React 桌宠与行情工作台
src/shared     数据契约与纯领域规则
server         本地行情中继示例
tests          领域测试
```

## 开源参考

工程代码独立实现，使用和参考以下开源项目的资产、工程边界与公开接口：

- [OpenPets](https://openpets.dev/docs)：透明 Electron 窗口、默认穿透、窄 preload API 和位置记忆思路，MIT License。
- [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts)：金融曲线渲染，Apache-2.0 License。
- [Electron](https://github.com/electron/electron)：桌面容器，MIT License。
- [React](https://github.com/facebook/react)：渲染层，MIT License。
- [Zustand](https://github.com/pmndrs/zustand)：客户端状态，MIT License。
- [Lucide](https://github.com/lucide-icons/lucide)：界面图标，ISC License。
- [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)：Live2D Web 渲染集成，MIT License。
- [Mate-Engine](https://github.com/shinyflvre/Mate-Engine)：Zome VRM 案例及可选官方运行器；上游代码和资产使用独立条款。
- [three-vrm](https://github.com/pixiv/three-vrm)：VRM 骨骼、材质、表情与物理加载，MIT License。
- [easyquotation](https://github.com/shidenggui/easyquotation)：腾讯/新浪行情字段协议参考，MIT License；本项目适配器用 TypeScript 独立实现。
- [AKShare](https://github.com/akfamily/akshare)：财经数据集合库调研，不在桌宠运行时安装 Python 依赖。

Haru 样例模型与 Cubism Core 使用独立的 Live2D 条款，不属于本项目 MIT 许可证，详见 [Live2D 第三方声明](NOTICE-LIVE2D.md)。商业发布前应替换为拥有明确发行权的原创模型。

## 下一阶段

- 取得可发行角色授权，或制作原创 Debby VRM 角色；不将现有预览资产误当作 MIT 资产
- 增加开盘/午休/收盘陪伴流程，接入经过验证的交易日历
- 专注与休息提醒、轻量个性化；不以交易次数或投资收益奖励成长
- VRM 导入、窗口边缘坐姿与经许可的动作包
- 可选行情上下文语音；核心行情、提醒、复盘不依赖 AI
- 接入具有明确使用权限的行情供应商
- 接入代码签名证书、自动更新和崩溃监控
- 增加多显示器、DPI、休眠恢复与全屏应用兼容测试矩阵
