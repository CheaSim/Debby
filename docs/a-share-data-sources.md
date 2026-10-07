# A 股免费数据与集合库

核查日期：2026-10-07。用途：本机、非商用的金融桌宠。

## 集合项目

用户所说的“集合站”可以使用 AKShare 的文档和接口目录：

- [AKShare 仓库](https://github.com/akfamily/akshare)：覆盖股票、指数、基金、宏观等公开财经数据的 Python 接口集合。
- [AKShare 文档](https://akshare.akfamily.xyz/)：按数据类别查找接口和示例。
- [easyquotation](https://github.com/shidenggui/easyquotation)：更轻量的腾讯/新浪等行情适配器。
- [efinance](https://github.com/Micro-sheep/efinance)：另一种股票、基金等数据接口集合；当前没有在 FinPet 中安装或验证。

AKShare 是接口集合库，不是拥有全部行情授权和 SLA 的免费托管 API。
桌宠当前只需要少量自选股快照，因此参考 easyquotation 的字段协议，
在 Electron 主进程独立实现 TypeScript 适配器，避免每位用户再安装 Python。
后续需要基本面、历史 K 线、ETF 或宏观数据时，再通过现有本地 WebSocket
中继接 AKShare 的低频接口。

## 当前实际接入

| 场景 | 数据源与行为 |
| --- | --- |
| 主源 | 腾讯 `https://qt.gtimg.cn/q=...`，批量沪深自选快照 |
| 备用 | 新浪 `https://hq.sinajs.cn/list=...`，主源网络、HTTP、解析或指数缺失时切换 |
| 编码 | GB18030/GBK；不使用 eval 执行上游返回代码 |
| 交易时段 | 每次成功后约 10 秒再请求，加入最多 1 秒随机抖动 |
| 休市 | 每次成功后约 60 秒再请求，保留真实收盘时间 |
| 两源失败 | 30、60、120 秒退避；保留最近有效数据并标记离线 |
| 缓存 | 用户数据目录 `market-cache.json`，原始行情时间不变，不混入演示数据 |
| 请求范围 | 最多 60 个沪深代码，始终包含上证指数；不抓取全市场 |
| 价格曲线 | 仅累计本次运行/缓存中的实际采样，新的交易日期重置；不伪造历史分时数据 |

UI 提供公开行情、演示行情、自定义 WebSocket 中继三种模式。
默认是公开行情，不支持 AAPL 等美股代码；自定义中继可以扩展其他市场。
价格提醒仅在交易中且行情新鲜时触发，休市和离线缓存不触发提醒。

## 本机实测

腾讯和新浪均成功返回上证指数、深证成指、创业板指和贵州茅台。
截至本次核查，两源返回的最新交易日期均为 2026-09-30：

- 腾讯上证指数：3842.19，涨跌幅 +0.31%，行情时间 16:15:00（上海时间）。
- 新浪上证指数：3842.1946，按昨收计算涨跌幅 +0.31%，行情时间 16:19:58。

不同供应商的小数位和时间可能不同。本程序展示供应商原始行情时间，
当前返回属于休市快照，不把成功连接等同于正在交易或保证无延迟。

复验命令：`npm.cmd run test:live`。该检查需要网络，会启动隔离的 Electron
窗口并读取真实行情；常规单元/E2E 测试不依赖公共行情接口。

## 使用边界

每台电脑本地取数可行，但不同电脑不一定拥有不同公网 IP；家庭、公司、
校园网络常共用 NAT 出口。公开接口仍可能限流、封禁或调整协议。
不使用代理池绕过限制，不抓取全市场，不绕过验证码和访问控制。

代码库的开源许可证不自动授予上游数据展示、缓存、再分发或商业使用权。
“免费可访问”也不等于“可以任意再分发”。本机研究/预览之外的正式发布，
应单独确认供应商条款，必要时换成有明确授权的行情中继。

## 协议参考

- [easyquotation 腾讯适配器](https://github.com/shidenggui/easyquotation/blob/master/easyquotation/tencent.py)
- [easyquotation 新浪适配器](https://github.com/shidenggui/easyquotation/blob/master/easyquotation/sina.py)
- [AKShare 腾讯 A 股适配器](https://github.com/akfamily/akshare/blob/main/akshare/stock/stock_zh_a_tx.py)
