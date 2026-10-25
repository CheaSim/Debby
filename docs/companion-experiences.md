# 发现：金融日常、陪伴与灵感

从面板的「发现」，或桌宠选项 →「发现 · 塔罗与日常」进入。日常聊天入口仍在基础页面。

## 当前体验

| 场景 | 行为 |
| --- | --- |
| 盘前准备 | 五项清单，按上海日期重新开始，本机保存勾选 |
| 收盘手记 | 记录心情、学到的一件事、下次的改变；点击保存后保留最近 30 天 |
| 金融茶话间 / 今天还好吗 | 打开已有对话并填入草稿；用户点发送后才调用配置的模型 |
| 塔罗小屋 | 22 张大阿卡纳，单张 / 三张，不放回抽取，正逆位，逐张翻牌与原创反思提示 |
| 今日签 | 按上海日期与主题生成稳定签文，无需生日等个人信息 |
| 动作小剧场 | 12 个手工调校的骨骼动作，切换时混合过渡，配合表情 |
| 一分钟放松 | 可随时结束；切走页面或收起面板会结束计时，尊重减少动态效果设置 |
| 舞蹈教室 | 打开已有视频学舞 / VRMA 动作库 |

牌面与签文是娱乐和自我探索内容，不预测命运、股价或投资结果。它们不读取持仓和行情，不影响指数心情。对话工具也保留这一边界。财运心态主题关注情绪与习惯。

清单与手记用当前 Electron 用户目录的 renderer localStorage 保存，并非加密保险箱。只有点击「和 Debby 聊聊」后，相关文字才带入对话草稿；发送遵循现有模型配置和云端确认流程。塔罗问题不写入日常手记存储。

## 扩展内容入口

`src/shared/companion-content.ts` 提供纯数据注册器，检查重复 ID 与缺失提示词。`DiscoveryPanel` 通过 props 接收入口与行为，不直接依赖模型、行情或 Electron：

```tsx
import { companionFeatures, registerCompanionFeatures } from '../src/shared/companion-content'
import { DiscoveryPanel } from '../src/renderer/src/components/DiscoveryPanel'

const features = registerCompanionFeatures(companionFeatures, [{
  id: 'my.reading', title: '读书时间', subtitle: '今天学一点新知识',
  category: '金融日常', kind: 'prompt', tone: 'sage', icon: 'book-open',
  prompt: '请问我今天想学哪个金融概念，再给一个简单例子。'
}])

// 这三个回调由宿主决定：草稿、动作、舞蹈均可适配其他 harness。
<DiscoveryPanel active={true} features={features}
  onPrompt={host.openDraft} onAction={host.animate} onDance={host.openDanceLibrary} />
```

`src/shared/rituals.ts` 的 `drawTarot(topic, spread, question?, random?)`、`dailyOracle(day?, topic?)` 可直接复用，无 React / Electron / 模型依赖。随机源可注入测试，返回牌面独立于共享牌库。

## Agent 接入

内置文字与通义陪伴共用 `createCompanionToolsPlugin({ performAction, now?, random? })`：

- `perform_avatar_action`：12 个稳定动作 ID，通过展示端口播放。
- `draw_tarot`：返回结构化牌阵、牌义与娱乐说明。
- `get_daily_oracle`：返回当天签文与一个小行动。

外部 MCP 的 `debby_animate` 增加 `nod / shake / heart / shy / think / stretch / bow / clap`，兼容原来的 `greet / celebrate / comfort / notify`。`debby_get_state` 返回 `actions`，便于客户端发现支持的动作。外部 Agent 仍先申请任务、遵循独占控制与取消协议；MCP 不新增设备或模型访问权。

```js
await client.setTask('tea-1', '陪你休息一下', 'working')
await client.animate('tea-1', 'stretch')
await client.say('tea-1', 'hello', '先让肩膀放松一下，慢慢来。')
await client.release()
```

`heart` 是双臂收拢的抱抱心意，不承诺精细手指比心。轻量动作由现有骨骼生成；舞蹈继续使用动作库。减少动态效果时停止骨骼动作，保留操作与文本。角色空闲时适度点头、思考、伸展；聆听、说话、任务或舞蹈期间不插入这些待机动作。

## 设计依据与验证

金融人士并非单一人群。本轮以计划、复盘、学习、压力舒缓作为产品假设，尚未做用户访谈，不将其描述为统计偏好。

- [MoneySense：行为科学与投资](https://www.moneysense.gov.sg/investments/behavioural-science-and-investing/)：提前写规则、定期回顾，有助于减少情绪对投资过程的干扰。
- [Investor.gov：风险承受能力](https://www.investor.gov/introduction-investing/investing-basics/save-and-invest/gauge-your-risk-tolerance)：目标、期限与能承受的波动应共同考虑。因此准备清单引导用户明确自己的边界，而非给统一交易结论。

`npm test` 覆盖随机抽牌唯一性、共享牌库隔离、日期边界、插件取消和全部外部动作协议；`npm run test:discovery-ui` 验证真实 Electron 角色骨骼、翻牌、草稿传递、本地持久化、计时停止与窄窗口布局。
