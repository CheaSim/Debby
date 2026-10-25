/** Original, offline entertainment content. No predictions, prices or model dependency. */
export interface TarotCard { id: number; name: string; symbol: string; keyword: string; upright: string; reversed: string; question: string }
const cards: [string, string, string, string, string, string][] = [
  ['愚者', 'feather', '新的起点', '给自己一次小小的尝试，不必等到万事俱备。', '热情之外，先确认自己能承担的边界。', '哪一件小事，你一直想开始？'],
  ['魔术师', 'wand-sparkles', '善用已有', '你已经拥有一些资源，把它们组合成一个行动。', '工具很多时，先选最需要的一件。', '手边哪种能力值得再用一次？'],
  ['女祭司', 'moon', '安静倾听', '给直觉留一点空间，也给事实留一个位置。', '不确定的时候，可以多问一句、多等一会儿。', '你真正的感受是什么？'],
  ['皇后', 'flower-2', '照顾自己', '照顾好睡眠、饮食和关系，是温柔的积累。', '把照顾别人的一点精力，也分给自己。', '今天怎样对自己好一点？'],
  ['皇帝', 'crown', '建立边界', '清晰的计划能让你把精力放在重要的事上。', '规则可以提供支持，也需要保留调整空间。', '哪条边界能让你更安心？'],
  ['教皇', 'book-open', '学习与传承', '借鉴可靠的经验，再找到适合自己的方法。', '别人的标准，不一定是你的唯一答案。', '你愿意向谁请教一个问题？'],
  ['恋人', 'heart', '真诚选择', '先看清自己珍惜什么，再做一个诚实的选择。', '分歧出现时，把需求说清楚比猜测更有用。', '哪个选择更接近你的价值观？'],
  ['战车', 'navigation', '稳住方向', '专注一个方向，把大目标拆成可以完成的小步。', '赶路之前，先看看是不是朝着自己想去的地方。', '下一步最小的行动是什么？'],
  ['力量', 'flame', '温柔的勇气', '勇气也可以很安静，坚定不必等于用力。', '感到疲惫时，允许自己暂时停下来。', '你已经坚持了哪件不容易的事？'],
  ['隐者', 'lamp', '留白与思考', '安静一点，会更容易听见自己的声音。', '独处之后，也可以向信任的人伸出手。', '你需要哪一种休息？'],
  ['命运之轮', 'orbit', '接纳变化', '变化是生活的一部分，先做好能控制的小事。', '暂时不顺的时候，别急着把它定义成全部。', '什么是你此刻能控制的？'],
  ['正义', 'scale', '事实与平衡', '把事实、感受和推测分开，会更容易理清思路。', '看起来合理的结论，也值得再核对一次。', '还有哪个角度没有被考虑？'],
  ['倒吊人', 'hourglass', '换个角度', '暂缓一步，也许能看见之前忽略的可能。', '等待不必漫无目的，可以给自己一个复看时间。', '如果换个角度，你会怎么理解？'],
  ['死神', 'leaf', '告别与更新', '为不再适合的习惯收尾，给新的生活留位置。', '改变可以从很小的部分开始，不必一次完成。', '哪件事可以好好说再见？'],
  ['节制', 'droplets', '找到节奏', '在努力和休息之间，找到可以持续的节奏。', '感觉失衡时，先恢复一件日常小习惯。', '什么节奏是你能长期保持的？'],
  ['恶魔', 'link', '看见牵绊', '留意反复消耗你的习惯，选择权仍然在你手里。', '从一个小边界开始，慢慢拿回自己的时间。', '什么正在过多占用你的注意力？'],
  ['高塔', 'zap', '重新整理', '计划被打断时，先照顾当下，再慢慢重建。', '不要在情绪最强的时候，强迫自己做大决定。', '此刻怎样让自己安稳一点？'],
  ['星星', 'star', '保留希望', '把目光放回仍在生长的小事，允许希望慢慢出现。', '理想很远时，先看见今天已经做到的一点。', '最近哪件小事给过你希望？'],
  ['月亮', 'eclipse', '容纳不确定', '信息不完整时，可以保留判断，不急着下结论。', '把担心写下来，分清已知和想象。', '你还需要了解什么事实？'],
  ['太阳', 'sun', '享受当下', '认真感受一个明亮的瞬间，把小小的快乐留下来。', '不需要一直积极，平常的一天也值得被接纳。', '今天有什么值得感谢的小事？'],
  ['审判', 'bell', '回望与成长', '回顾过去是为了理解自己，不是责备自己。', '给过去的自己一点宽容，再决定下一步。', '这段经历让你学到了什么？'],
  ['世界', 'globe', '完成与连接', '给完成的阶段一个小庆祝，再从容开启下一页。', '接近终点时，先把最后一件小事收好。', '你想怎样庆祝自己的进步？']
]
export const tarotDeck: readonly TarotCard[] = cards.map(([name, symbol, keyword, upright, reversed, question], id) => ({ id, name, symbol, keyword, upright, reversed, question }))
export const tarotTopics = ['心情', '工作', '关系', '财运心态'] as const
export type TarotTopic = typeof tarotTopics[number]
export type TarotSpread = 'single' | 'three'
export interface TarotDraw { card: TarotCard; reversed: boolean; position: string }
export interface TarotReading { version: 1; topic: TarotTopic; question: string; spread: TarotSpread; draws: TarotDraw[] }
export const ritualNote = '娱乐与自我探索，不预测现实结果，也不作为投资决策依据。'
export const randomUnit = (): number => crypto.getRandomValues(new Uint32Array(1))[0] / 0x1_0000_0000
export function drawTarot(topic: TarotTopic, spread: TarotSpread, question = '', rng: () => number = randomUnit): TarotReading {
  if (!tarotTopics.includes(topic) || !['single', 'three'].includes(spread) || typeof question !== 'string' || question.length > 120) throw Error('请选择有效的主题与牌阵，问题不超过 120 字。')
  const random = (): number => { const n = rng(); if (!Number.isFinite(n) || n < 0 || n >= 1) throw Error('Invalid random source'); return n }
  const deck = [...tarotDeck]
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]] }
  const positions = spread === 'single' ? ['此刻的提醒'] : ['此刻', '留意', '下一小步']
  return { version: 1, topic, spread, question: question.trim(), draws: positions.map((position, i) => ({ card: { ...deck[i] }, reversed: random() < .5, position })) }
}
export const shanghaiDay = (now = Date.now()): string => new Date(now + 8 * 3600_000).toISOString().slice(0, 10)
const signs = [
  { title: '慢慢来，也会到', word: '从容', good: '按自己的节奏完成一件小事', notice: '不要把忙碌当作进步的唯一标准', step: '把今天最重要的一件事写下来。' },
  { title: '留一点余地', word: '留白', good: '为休息和意外留出空间', notice: '信息太多时，先关掉几个窗口', step: '离开屏幕，给自己倒一杯水。' },
  { title: '把心放稳', word: '定心', good: '先看事实，再听感受', notice: '情绪强烈时，暂缓重要决定', step: '写下一个事实和一个担心，分开看它们。' },
  { title: '一小步就好', word: '生长', good: '把大目标拆成今天能完成的部分', notice: '不必用别人的进度衡量自己', step: '给一个小行动留出十分钟。' },
  { title: '温柔也有力量', word: '柔韧', good: '向信任的人表达真实需求', notice: '不需要独自扛下所有事', step: '给一个想念的人发一句问候。' },
  { title: '好好收尾', word: '圆满', good: '回顾一件已经完成的事', notice: '反省不等于责备自己', step: '记录今天做对的一件事。' },
  { title: '看见小小的光', word: '晴朗', good: '留意平凡生活里的好消息', notice: '允许心情有起伏', step: '找到身边三件让你感到舒服的东西。' },
  { title: '先听听自己', word: '清晰', good: '把真正重要的事情排在前面', notice: '热闹的声音不一定适合你', step: '问问自己：这件事为什么对我重要？' }
] as const
/** A stable daily prompt, not a fortune computed from personal or market data. */
export function dailyOracle(day = shanghaiDay(), topic: TarotTopic = '心情') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !tarotTopics.includes(topic)) throw Error('Invalid oracle date or topic')
  let hash = 2166136261
  for (const ch of `debby-v1:${day}:${topic}`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0
  return { day, topic, ...signs[hash % signs.length], note: ritualNote }
}
