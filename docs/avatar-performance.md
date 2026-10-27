# 对话表情与舞蹈表演

Debby 用三条独立通道表现：台词里的语义控制表情，动作片段控制身体，实际音频振幅控制口型。聊天不会停止正在播放的舞蹈。3D VRM 和 2.5D 立绘共用表情语义；2.5D 角色跳舞时仍暂时切到 3D 骨骼角色，结束后恢复立绘。

## 直接体验

1. 点击桌宠「对话」，正常聊天。可以试试「今天有点累」「Debby 你好可爱」「我终于完成了」。
2. 「更多 → 学跳舞」，选择舞台表情风格后播放。支持自动编排、温柔陪伴、元气舞台、俏皮互动、只跳动作。
3. 跳舞中再点「对话」，身体继续跳，回复表情覆盖舞台表情；短暂表情结束、取消回复或开始新问题后恢复舞台编排。对话页侧栏保留暂停、进度与停止。
4. 已配置通义 BYOK 时，打开「阿里云自动朗读」，表情按实际播放的句子切换。不开麦、不自动开摄像头。

## 对话协议与扩展点

`src/shared/avatar-performance.ts` 是无 React / Electron / 模型 SDK 依赖的契约，支持 `neutral / happy / caring / sad / shy / surprised / curious / playful / proud` 九种语义，强度 0–1。

内置 pi 在已有那次生成里输出隐藏标记，例如：

```text
[[emotion:caring]]辛苦啦，先休息一下。[[emotion:proud|0.8]]你已经做得很好啦。
```

`parseExpressionText` 对累计流式文本提取 `DialogueExpressionCue[]`，偏移量基于移除标记后的 UTF-16 文本。即使标记跨 token，也先过滤再发布给界面和 TTS。未知标记忽略，最多 12 个有效节点；提示词要求每条最多 3 个。没有新增模型调用，默认关闭思考不变。

忽略标记的模型使用保守语义规则兜底；内部宿主可通过 `DebbyAgentOptions.inferExpression(user, reply)` 替换规则。用户压力、亏损等语境倾向温柔安慰，不直接根据「涨」字庆祝。接入其他后端时，可直接输出 `ChatLine.expressions`；也可以复用解析器。替换整个 `systemPrompt` 的宿主如需标记协议，应附上导出的 `expressionPrompt`。

`useAvatarPerformance` 只消费当前轮回复，错误、取消和旧轮音频都不会再次触发。声音开启时，`StreamingSpeech` 给每句音频附上 `SpeechMark`；`BrowserSpeechPlayback` 在 AudioContext 到达该句实际开始时发出回调，排队中的下一句不会提前改变脸部。当前为**句子级同步**，句中多个标记取该句最后一个；没有词级或音素级时间戳。

面部优先级：摸头/提起等直接互动 → 当前对话 → 外部 Agent 台词表情 → 舞台时间轴 → 原有行情/任务表情。3D 映射保留音频口型、取消冲突的嘴部预设，约 140 ms 平滑过渡；跳舞时不添加歪头骨骼偏移，保留原动作头部轨道。2.5D 使用自身眉眼、嘴形和倾斜参数，不伪造 3D 骨骼。

## 舞蹈表情时间轴

`DanceMotion` v1 新增可选 `expressions`，旧文件继续有效。工作室 JSON 导入/导出、动作库保存均保留该字段。示例：

```json
{
  "expressions": [
    { "time": 0, "duration": 2, "emotion": "shy", "intensity": 0.65 },
    { "time": 4, "duration": 4, "emotion": "proud", "intensity": 0.8 }
  ]
}
```

把该字段加入完整的 `.debbydance.json`，原有 `tracks` 不用变。时间单位为秒，按开始时间严格递增，最多 64 个节点，单节点时长 0.2–20 秒；超出动作末尾会截短。重叠时后开始的节点接管，结束后恢复基础表情，前一节点不会复活。空隙恢复基础表情。

「自动编排」有自定义节点时使用节点，没有时使用元气编排；另外三种风格覆盖自定义节点。「只跳动作」关闭舞台表情，仍允许对话表情。暂停冻结舞台时间，拖动进度立即定位，速度/循环共用 `dancePosition`，无需另开表情计时器。VRMA 使用预设风格；当前没有 VRMA 面部时间轴编辑器，也不从舞蹈视频推断原演员的情绪。

## Agent / MCP 一并发送表情

原来的 7 个 MCP 工具保持兼容。`debby_say` 新增可选 `expression`，`debby_dance` 新增可选 `expressionStyle`，不用再调用单独的表情工具：

```js
await debby.dance(taskId, { action: 'play', id: 'welcome', expressionStyle: 'gentle' })
await debby.say(taskId, 'reply-1', '我陪你慢慢来。', {
  expression: { emotion: 'caring', intensity: 0.75 }
})
```

字段缺省不改变旧行为。同一流式台词后续块可更新表情；不传表情时保持已有节点的原过期时间，不会无限续期。外部台词表情 6.5 秒后恢复基础/舞台表情，取消、断开与新任务清除节点。MCP 台词不会自动调用云端 TTS。运行示例：

```powershell
node examples/avatar/conversation-dance.mjs "C:/path/to/agent-bridge.json"
```

## 验证

`npm.cmd test` 覆盖逐字符流式边界、语义兜底、取消、真实 pi/SSE 标记过滤、双渲染映射、时间轴校验/往返与音频时钟。`npm.cmd run test:performance-ui` 在隔离的 Electron 实例中验证真实 VRM、腮红、聊天不中断舞蹈、真实 PCM 播放的句子切换、暂停与跳转。语音供应商在测试中替换为合成音频，没有调用付费模型。
