export interface DialoguePrompt { label: string; text: string }

/** Small deterministic suggestions; usable by other conversation backends without model calls. */
export function dialoguePrompts(question?: string, hasReply = false, failed = false): DialoguePrompt[] {
  if (failed && question) return [
    { label: '重试这句', text: question },
    { label: '换个轻松的话题', text: '先不聊行情，陪我聊点轻松的吧。' }
  ]
  if (!hasReply) return [
    { label: '今天大盘怎么样？', text: '今天大盘怎么样？请带上行情时间和来源，数据过期时告诉我。' },
    { label: '今天有点累', text: '今天有点累，陪我聊两句吧。' },
    { label: '你能帮我做什么？', text: '你能帮我做什么？告诉我一件现在就可以试试的小事。' }
  ]
  if (/行情|大盘|指数|自选|涨跌|风险|数据/.test(question ?? '')) return [
    { label: '看看我的自选', text: '帮我看看当前自选的行情，简短总结一下。' },
    { label: '数据有延迟吗？', text: '这些行情的来源和更新时间是什么？如果有延迟或缓存，请告诉我。' },
    { label: '换个轻松的话题', text: '先不聊行情，陪我聊点轻松的吧。' }
  ]
  return [
    { label: '我想接着说', text: '我想接着说，你先听我聊聊吧。' },
    { label: '给我一个小建议', text: '给我一个今天就能做到的小建议吧。' },
    { label: '看看今天的大盘', text: '今天大盘怎么样？请带上行情时间和来源。' }
  ]
}
