# FinPet 金融桌宠

FinPet 是一个 Windows 优先的本地桌面伴侣。它以透明、无边框、置顶窗口常驻桌面，用桌宠状态表达自选行情，并提供可展开的行情与价格提醒工作台。

> 当前行情默认是离线演示数据，仅用于开发和产品验证，不构成投资建议。发布商业版本前必须接入具备展示及再分发授权的行情服务。

## 已实现

- 透明无边框桌宠窗口、置顶、拖动、托盘、鼠标穿透和位置记忆
- Live2D Cubism 4 桌宠，支持视线跟随、点击动作和表情切换
- `idle / bullish / bearish / alert / offline` 五态行情表情
- 展开式行情工作台、自选切换、实时曲线和涨跌状态
- 突破/跌破提醒、五分钟冷却、系统通知和本地持久化
- 本地演示行情、可配置 WebSocket 行情中继和断线离线态
- 单实例、后台开机启动、正式应用/托盘图标
- `contextIsolation + sandbox + CSP + 白名单 IPC` 安全边界
- Windows NSIS 打包配置、领域测试和浏览器预览模式

## 开发

需要 Node.js 22 或更高版本。Windows PowerShell 若禁止执行 `npm.ps1`，使用 `npm.cmd`。

```powershell
npm.cmd install
npm.cmd run assets
npm.cmd run dev
```

验证：

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
```

Windows 安装包：

```powershell
npm.cmd run package:win
```

## 接入真实行情

设置环境变量后启动，主进程会连接远程 WSS；未设置时使用本地演示源。

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

然后在行情面板右侧填写 `ws://127.0.0.1:8787`。完整契约见 [行情中继协议](docs/market-relay-protocol.md)。免费 A 股数据源的开发期选型见 [A 股数据源调研](docs/a-share-data-sources.md)。

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

本项目是原创实现，参考了以下开源项目的工程边界和公开接口：

- [OpenPets](https://openpets.dev/docs)：透明 Electron 窗口、默认穿透、窄 preload API 和位置记忆思路，MIT License。
- [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts)：金融曲线渲染，Apache-2.0 License。
- [Electron](https://github.com/electron/electron)：桌面容器，MIT License。
- [React](https://github.com/facebook/react)：渲染层，MIT License。
- [Zustand](https://github.com/pmndrs/zustand)：客户端状态，MIT License。
- [Lucide](https://github.com/lucide-icons/lucide)：界面图标，ISC License。
- [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display)：Live2D Web 渲染集成，MIT License。

Haru 样例模型与 Cubism Core 使用独立的 Live2D 条款，不属于本项目 MIT 许可证，详见 [Live2D 第三方声明](NOTICE-LIVE2D.md)。商业发布前应替换为拥有明确发行权的原创模型。

## 下一阶段

- 接入签约行情供应商及服务端鉴权
- 将开发用 Haru 样例替换为原创 FinPet Live2D 模型
- 增加用户登录、云同步与设备限额
- 接入代码签名证书、自动更新和崩溃监控
- 增加多显示器、DPI、休眠恢复与全屏应用兼容测试矩阵
