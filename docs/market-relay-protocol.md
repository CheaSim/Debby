# FinPet 行情中继协议

桌面客户端只连接 FinPet 行情中继，不直接携带供应商密钥。生产中继负责供应商鉴权、展示权限、限流、代码映射、交易时段、延迟等级和断线补偿。

## 连接

- 生产环境：`wss://`。
- 本机开发：允许 `ws://localhost`、`ws://127.0.0.1` 和 `ws://[::1]`。
- 客户端收到断线事件后将现有报价标记为 `offline`，三秒后重连。
- 清空设置中的中继地址会立即切回本地演示行情。

## 服务端推送

每条消息可以是一个 `QuoteTick`，也可以是 `QuoteTick[]`。最低要求只有合法的 `symbol` 和正数 `price`；客户端会补齐其他字段，但生产服务应发送完整记录。

```json
{
  "symbol": "600519.SH",
  "name": "贵州茅台",
  "price": 1721,
  "previousClose": 1700,
  "change": 21,
  "changePct": 1.2353,
  "timestamp": 1785931200000,
  "status": "open",
  "sparkline": [1700, 1708.2, 1721]
}
```

字段约束：

| 字段 | 类型 | 约束 |
|---|---|---|
| `symbol` | string | 必填且非空；建议包含市场后缀 |
| `name` | string | 展示名；缺失时回退为代码 |
| `price` | number | 必填、有限且大于 0 |
| `previousClose` | number | 大于 0；用于计算涨跌 |
| `change` | number | 缺失时由客户端计算 |
| `changePct` | number | 缺失时由客户端计算 |
| `timestamp` | number | Unix 毫秒；缺失时使用接收时间 |
| `status` | string | `open`、`closed` 或 `offline` |
| `sparkline` | number[] | 最多保留最近 120 点，非法点会被过滤 |

## 本地联调

```powershell
npm.cmd run relay:demo
```

然后在 FinPet 行情中继输入框中填写 `ws://127.0.0.1:8787`。健康检查地址为 `http://127.0.0.1:8787/health`。

示例服务只生成模拟数据，不得作为真实行情或投资决策依据。
