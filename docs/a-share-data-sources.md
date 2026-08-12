# A 股免费数据源调研

调研日期：2026-08-12。

## 结论

开发期采用“每台电脑本地适配器”可行，但不要让客户端轮询全市场，也不要把不同电脑等同于不同公网 IP。公司、校园和家庭网络都可能通过 NAT 共用出口 IP；上游仍可按 IP、UA、Cookie 或行为模式限流。

推荐组合：

1. 自选股实时快照：`easyquotation`，默认腾讯/新浪接口，每 3-5 秒批量拉取一次当前自选股。
2. 分钟线与第一备份：`mootdx`，连接通达信公开行情节点，维护节点探活与自动切换。
3. 历史日线：`BaoStock`，只做首次下载与每日收盘后的增量更新。
4. 研究型扩展：`AKShare`，用于基本面、宏观、ETF 等低频数据，不放进桌宠实时关键路径。

## 对比

| 项目 | 适合数据 | Token | 优点 | 主要风险 | 建议 |
| --- | --- | --- | --- | --- | --- |
| easyquotation | A 股实时快照、五档 | 无 | MIT、接口小、批量自选股简单 | 依赖新浪/腾讯非正式网页接口，字段和可用性可能变化 | 实时首选，必须有降级 |
| mootdx | 快照、分钟、K 线、财务 | 无 | MIT、直接连接通达信行情节点 | 项目声明仅供学习交流且不得商用；节点可能失效 | 开发期备选，不直接承诺商用 |
| AKShare | 实时、历史、基本面、宏观 | 无 | MIT、覆盖最广、维护活跃 | 项目明确主要用于学术研究；底层网站会改接口或封 IP | 低频研究和补充数据 |
| BaoStock | 日/周/月/分钟历史数据 | 无需付费账号 | 无需注册，历史数据结构稳定 | 当日数据通常盘后更新，不是实时桌宠源 | 历史日线与回补 |
| efinance | 东财实时与历史 | 无 | MIT、API 友好 | README 声明不得商用；东财自 2025 年强化 IP 限频 | 暂不作为主链 |

开源许可证只覆盖客户端库代码，不自动授予上游行情数据的展示、缓存、再分发或商业使用权。正式发布前必须单独确认各数据提供方条款，或者切换到已签约行情供应商。

## 本地架构

```text
Electron renderer
      | normalized QuoteTick
Electron main process
      | child process / localhost WebSocket
Local market adapter
      |-- easyquotation (snapshot)
      |-- mootdx (fallback/minute)
      `-- BaoStock + SQLite (history/cache)
```

本地适配器应负责：

- 只请求自选股，禁止周期性抓取全市场。
- 单批请求合并，交易时段 3-5 秒一次，非交易时段降到 60 秒或停止。
- 指数退避并加入随机抖动；连续失败后熔断 1-5 分钟。
- SQLite 缓存历史数据和上一笔有效快照；展示数据时间和离线状态。
- easyquotation 失败后切 mootdx，两个实时源都失败则展示旧数据并标记离线。
- 不绕过验证码、访问控制或明确的服务限制。

## 参考

- AKShare: https://github.com/akfamily/akshare
- easyquotation: https://github.com/shidenggui/easyquotation
- mootdx: https://github.com/mootdx/mootdx
- efinance: https://github.com/Micro-sheep/efinance
- BaoStock: https://www.baostock.com/
