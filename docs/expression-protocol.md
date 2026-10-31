# Debby Expression v1

模型在正常回答中写标记，Debby 在展示、朗读前将其剥离，并在相应位置切换表情。不增加模型调用。内置文字、通义陪伴、外部 Agent / MCP 共用解析器；普通聊天不需要再次授权，配置模型一次后直接发送即可。

```text
[[emotion:caring|0.7]]今天辛苦啦，先陪你歇一会儿。
[[emotion:playful|0.8]]要不要听我讲个小笑话？
```

## 语法

`[[emotion:NAME]]` 或 `[[emotion:NAME|INTENSITY]]`，区分大小写。强度为 0–1，最多两位小数，省略时为 0.75。标记表示面部语义，不能调用工具、打开设备、控制交易或冒充身体动作。

| NAME | 含义 | 适合的语境 |
| --- | --- | --- |
| neutral | 平静 | 普通解释、回归日常 |
| happy | 开心 | 轻松问候、好消息 |
| caring | 温柔 | 疲惫、压力、亏损时陪伴 |
| sad | 低落 | 适度共情 |
| shy | 害羞 | 被夸奖、可爱互动 |
| surprised | 惊讶 | 意外的新消息 |
| curious | 好奇 | 请教、探索问题 |
| playful | 俏皮 | 玩笑、活泼互动 |
| proud | 为你骄傲 | 肯定努力与进展 |

建议每条回答 1–3 个，最多解析 12 个有效节点。行情涨跌不直接等同于用户心情。没有标记时，内置对话保留保守的语义兜底；外部台词不擅自猜测表情。渲染器按角色能力映射：VRM 可使用 blendshape；立绘按自身表情姿势切换，静态素材不因此获得独立嘴形。

## 流式传输

调用 `parseExpressionText(raw, done)` 时传入**累计原文**，不要拿上次清洗过的正文拼接。它返回 `{ text, cues }`；`offset` 是移除标记后正文的 UTF-16 偏移。允许任意 token 边界，例如 `[[emo` + `tion:shy|0.` + `7]]谢谢你呀。`。半截标记先隐藏，闭合后才生效；已闭合但未知的名称或非法强度被移除且不执行。未闭合标记在换行或超过 80 字符后恢复普通文本处理，避免无限吞掉正文。

文字生成时采用当前最新的有效节点。内置语音使用实际音频播放的句子时间切换，同一句取最后一个节点；不是词级或音素级同步。停止、错误、新问题后不会播放旧轮表情。嘴部振幅与身体舞蹈保持独立。

## 外部 Agent / MCP

`GET /v1/state` 和 `DebbyClient.getState()` 的 `expressionProtocol` 提供名称、版本、可用表情与限制。MCP 的 `debby_say` 也接受相同标记，不需要另一次工具调用。桌宠的本机接入开启和令牌机制保持原样。

```js
await debby.setTask('chat', '陪你聊聊', 'working')
await debby.say('chat', 'turn-1', '[[emo', { done: false })
await debby.say('chat', 'turn-1', 'tion:shy|0.7]]谢谢你呀。', {
  append: true, done: true
})
```

首块 `append: false`；后续块 `append: true`；最后一块 `done: true`。空格和换行保留，累计**原文含标记**最多 2000 UTF-16 字符。`append: false` 替换当前未结束台词，不能追加已结束或过期的轮次。外部流在完整标记到达时触发表情，默认保持 6.5 秒；纯正文追加不会续期。新的标记节点可以更新表情；取消、断开、新任务清理原文缓冲和表情。

已有 JSON 字段仍可使用：`expression: { emotion: 'caring', intensity: 0.7 }`。同一事件同时含两种格式时 JSON 优先；后续新的内联节点可接管。替换正文并移除内联节点时清除该内联表情，显式 JSON 表情保持其原有效期。外部台词不会自动发起云端 TTS。

运行 `node examples/avatar/expression-stream.mjs "C:/path/to/agent-bridge.json"` 可验证分块与表情，示例只控制桌宠台词，不访问模型、麦克风或摄像头。

## 接入自己的后端

导入 `src/shared/avatar-performance.ts` 的 `expressionPrompt` 附在模型系统提示中；`parseExpressionText`、`formatExpressionTag`、`expressionProtocol` 均无 React / Electron / 模型 SDK 依赖。自定义对话后端也可直接提供 `ChatLine.expressions`。不支持协议的模型仍能正常回复。
