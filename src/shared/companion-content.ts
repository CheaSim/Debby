export type CompanionFeatureKind = 'tarot' | 'oracle' | 'checklist' | 'journal' | 'relax' | 'actions' | 'dance' | 'prompt'
export interface CompanionFeature {
  id: string; title: string; subtitle: string; category: '金融日常' | '陪伴放松' | '灵感仪式';
  icon: string; kind: CompanionFeatureKind; tone: 'rose' | 'blue' | 'sage' | 'violet' | 'sand'; prompt?: string
}
/** Plain data registry: hosts can add prompt-based experiences without changing the view. */
export function registerCompanionFeatures(...groups: readonly (readonly CompanionFeature[])[]): CompanionFeature[] {
  const ids = new Set<string>()
  return groups.flatMap(group => group.map(feature => {
    if (!feature.id || ids.has(feature.id)) throw Error(`Duplicate or empty companion feature: ${feature.id}`)
    if (feature.kind === 'prompt' && !feature.prompt?.trim()) throw Error(`Missing prompt: ${feature.id}`)
    ids.add(feature.id); return { ...feature }
  }))
}
export const companionFeatures = registerCompanionFeatures([
  { id: 'tarot', title: '塔罗小屋', subtitle: '翻一张牌，听听自己的心', category: '灵感仪式', icon: 'sparkles', kind: 'tarot', tone: 'violet' },
  { id: 'oracle', title: '今日签', subtitle: '给平凡的一天，一点仪式感', category: '灵感仪式', icon: 'sun', kind: 'oracle', tone: 'sand' },
  { id: 'checklist', title: '盘前准备', subtitle: '计划、边界、信息，逐项确认', category: '金融日常', icon: 'list-checks', kind: 'checklist', tone: 'blue' },
  { id: 'journal', title: '收盘手记', subtitle: '记下选择，也照顾自己的心情', category: '金融日常', icon: 'notebook-pen', kind: 'journal', tone: 'sage' },
  { id: 'actions', title: '动作小剧场', subtitle: '挥手、鼓掌、抱抱心意', category: '陪伴放松', icon: 'heart-handshake', kind: 'actions', tone: 'rose' },
  { id: 'relax', title: '一分钟放松', subtitle: '放下行情，陪你慢慢呼吸', category: '陪伴放松', icon: 'wind', kind: 'relax', tone: 'sage' },
  { id: 'dance', title: '舞蹈教室', subtitle: '学一段新舞，换个好心情', category: '陪伴放松', icon: 'music-2', kind: 'dance', tone: 'violet' },
  { id: 'finance-chat', title: '金融茶话间', subtitle: '指标、概念、投资纪律，聊明白', category: '金融日常', icon: 'coffee', kind: 'prompt', tone: 'sand', prompt: '我想学一个金融知识。请先问我对股票、基金还是风险管理感兴趣，再用一个简单例子解释，不推荐具体买卖。' },
  { id: 'comfort-chat', title: '今天还好吗', subtitle: '有些心事，可以慢慢说', category: '陪伴放松', icon: 'messages-square', kind: 'prompt', tone: 'rose', prompt: '今天想找你聊聊天。先轻轻问问我今天过得怎么样，听我说，不急着给建议。' }
])
export const premarketChecklist = ['确认今天的计划与观察重点', '核对信息来源和发布时间', '写下能承受的风险与仓位边界', '提前约定暂停操作的情形', '确认睡眠、饮水和当下心情'] as const
