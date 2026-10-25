import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, Coffee, Crown, Droplets, Eclipse, Feather, Flame, Flower2, Globe, Heart, HeartHandshake, Hourglass, Lamp, Leaf, Link, ListChecks, MessagesSquare, Moon, Music2, Navigation, NotebookPen, Orbit, Scale, Sparkles, Star, Sun, WandSparkles, Wind, Zap, Bell, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { companionFeatures, premarketChecklist, type CompanionFeature } from '../../../shared/companion-content'
import { avatarActionInfo, avatarActions, type AvatarAction } from '../../../shared/avatar'
import { dailyOracle, drawTarot, ritualNote, shanghaiDay, tarotTopics, type TarotReading, type TarotSpread, type TarotTopic } from '../../../shared/rituals'

const icons: Record<string, LucideIcon> = { sparkles: Sparkles, sun: Sun, 'list-checks': ListChecks, 'notebook-pen': NotebookPen, 'heart-handshake': HeartHandshake, wind: Wind, 'music-2': Music2, coffee: Coffee, 'messages-square': MessagesSquare, feather: Feather, 'wand-sparkles': WandSparkles, moon: Moon, 'flower-2': Flower2, crown: Crown, 'book-open': BookOpen, heart: Heart, navigation: Navigation, flame: Flame, lamp: Lamp, orbit: Orbit, scale: Scale, hourglass: Hourglass, leaf: Leaf, droplets: Droplets, link: Link, zap: Zap, star: Star, eclipse: Eclipse, bell: Bell, globe: Globe }
function ContentIcon({ name, size = 21 }: { name: string; size?: number }) { const Icon = icons[name] ?? Sparkles; return <Icon size={size} strokeWidth={1.45} aria-hidden="true" /> }
const storageKey = 'debby:daily-notes:v1'
interface DailyNote { day: string; checks: number[]; mood: string; lesson: string; next: string }
const emptyNote = (day: string): DailyNote => ({ day, checks: [], mood: '平静', lesson: '', next: '' })
function loadNotes(): DailyNote[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(raw) ? raw.filter((n): n is DailyNote => n && typeof n.day === 'string' && Array.isArray(n.checks) && n.checks.every((x: unknown) => Number.isInteger(x) && Number(x) >= 0 && Number(x) < 5) && ['mood', 'lesson', 'next'].every(k => typeof n[k] === 'string' && n[k].length <= 1000)).slice(-30) : []
  } catch { return [] }
}
export interface DiscoveryPanelProps {
  active: boolean
  onAction: (name: AvatarAction) => void
  onPrompt: (text: string) => void
  onDance: () => void
  features?: readonly CompanionFeature[]
}
export function DiscoveryPanel({ active, onAction, onPrompt, onDance, features = companionFeatures }: DiscoveryPanelProps): React.JSX.Element {
  const [category, setCategory] = useState('全部')
  const [selected, setSelected] = useState<string>()
  const feature = features.find(item => item.id === selected)
  const backRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [day, setDay] = useState(shanghaiDay)
  const [note, setNote] = useState(() => loadNotes().find(n => n.day === shanghaiDay()) ?? emptyNote(shanghaiDay()))
  const [notice, setNotice] = useState('')
  const [topic, setTopic] = useState<TarotTopic>('心情')
  const [spread, setSpread] = useState<TarotSpread>('three')
  const [question, setQuestion] = useState('')
  const [reading, setReading] = useState<TarotReading>()
  const [revealed, setRevealed] = useState<number[]>([])
  const [cardIndex, setCardIndex] = useState(0)
  const [oracleOpen, setOracleOpen] = useState(false)
  const [breathStart, setBreathStart] = useState<number>()
  const [clock, setClock] = useState(Date.now)
  useEffect(() => { if (active && selected) backRef.current?.focus() }, [selected, active])
  useEffect(() => {
    if (!active) { setBreathStart(undefined); return }
    const refresh = () => {
      const next = shanghaiDay()
      if (day !== next) { setDay(next); setNote(loadNotes().find(n => n.day === next) ?? emptyNote(next)); setOracleOpen(false); setNotice('') }
    }
    refresh(); const timer = window.setInterval(refresh, 30_000)
    return () => window.clearInterval(timer)
  }, [active, day])
  useEffect(() => {
    if (!active || breathStart === undefined || feature?.kind !== 'relax') return
    const timer = window.setInterval(() => { const now = Date.now(); setClock(now); if (now - breathStart >= 60_000) window.clearInterval(timer) }, 250)
    return () => window.clearInterval(timer)
  }, [active, breathStart, feature?.kind])
  const elapsed = breathStart === undefined ? 0 : Math.min(60, Math.max(0, (clock - breathStart) / 1000))
  const phase = elapsed % 10
  const breathing = breathStart !== undefined && elapsed < 60
  const breathLabel = breathStart === undefined ? '准备好了吗' : elapsed >= 60 ? '做得很好' : phase < 4 ? '轻轻吸气' : '慢慢呼气'
  const scale = breathing ? phase < 4 ? .8 + phase / 4 * .28 : 1.08 - (phase - 4) / 6 * .28 : .9
  const save = (next: DailyNote, journal = feature?.kind === 'journal'): void => {
    setNote(next)
    try {
      const notes = loadNotes()
      const stored = journal ? next : { ...(notes.find(n => n.day === next.day) ?? emptyNote(next.day)), checks: next.checks }
      localStorage.setItem(storageKey, JSON.stringify([...notes.filter(n => n.day !== next.day), stored].slice(-30))); setNotice('已保存在这台电脑')
    }
    catch { setNotice('暂时无法保存，请先复制内容，避免丢失。') }
  }
  const leave = () => { setSelected(undefined); setNotice(''); setBreathStart(undefined); requestAnimationFrame(() => triggerRef.current?.focus()) }
  const oracle = dailyOracle(day, topic)
  const selectedDraw = reading?.draws[cardIndex]
  const askAboutReading = (): void => {
    if (!reading) return
    const cards = revealed.map(i => { const d = reading.draws[i]; return `${d.position}：${d.card.name}（${d.reversed ? '逆位' : '正位'}），${d.reversed ? d.card.reversed : d.card.upright}` }).join('；')
    onPrompt(`我们来聊聊这次娱乐塔罗。主题：${reading.topic}。${reading.question ? `我的问题：${reading.question}。` : ''}已翻开的牌：${cards}。${ritualNote}请围绕牌面和我的感受，温柔地问我一个问题，不预测未来。`)
  }
  return <section className="discovery-panel" aria-label="发现更多陪伴">
    {!feature ? <>
      <header className="discovery-hero"><span className="discovery-eyebrow">DEBBY · LITTLE MOMENTS</span><h1>认真盯盘，也好好生活。</h1><p>陪你理清思路，也陪你做一点有趣的小事。</p><span className="discovery-date">{day.replaceAll('-', ' / ')}</span></header>
      <div className="discovery-filters" role="group" aria-label="内容分类">{['全部', '金融日常', '陪伴放松', '灵感仪式'].map(value => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div>
      <div className="discovery-grid">{features.filter(item => category === '全部' || item.category === category).map(item => <button key={item.id} className={`discovery-card tone-${item.tone}`} onClick={event => {
        triggerRef.current = event.currentTarget
        if (item.kind === 'dance') { onDance(); return }
        if (item.kind === 'prompt') { onPrompt(item.prompt!); return }
        setSelected(item.id); setNotice(''); onAction(item.kind === 'tarot' ? 'think' : item.kind === 'relax' ? 'comfort' : 'nod')
      }}><span className="discovery-card-icon"><ContentIcon name={item.icon} /></span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><ChevronRight size={14} className="discovery-card-arrow" /></button>)}</div>
      <footer className="discovery-footnote">小仪式可离线体验 · 对话沿用你的模型配置</footer>
    </> : <>
      <header className="discovery-detail-heading"><button ref={backRef} className="ghost-icon" aria-label="返回发现" onClick={leave}><ArrowLeft size={18} /></button><div><h1>{feature.title}</h1><p>{feature.subtitle}</p></div><span className={`discovery-card-icon tone-${feature.tone}`}><ContentIcon name={feature.icon} /></span></header>
      {feature.kind === 'tarot' && <div className="tarot-room">
        <div className="ritual-caption"><Sparkles size={14} /><span>22 张大阿卡纳 · 一次与自己的对话</span></div>
        {!reading ? <>
          <div className="tarot-deck-art" aria-hidden="true"><span /><span /><span><Moon size={35} strokeWidth={1} /><i /><Star size={12} /></span></div>
          <label className="discovery-field">想聊哪个主题<select aria-label="塔罗主题" value={topic} onChange={e => setTopic(e.target.value as TarotTopic)}>{tarotTopics.map(t => <option key={t}>{t}</option>)}</select></label>
          <div className="tarot-spreads" role="group" aria-label="塔罗牌阵"><button aria-pressed={spread === 'single'} onClick={() => setSpread('single')}>一张牌<small>此刻的提醒</small></button><button aria-pressed={spread === 'three'} onClick={() => setSpread('three')}>三张牌<small>此刻 · 留意 · 下一小步</small></button></div>
          <label className="discovery-field">在心里想一个问题，也可以写下来<input aria-label="想问塔罗的问题" value={question} maxLength={120} onChange={e => setQuestion(e.target.value)} placeholder="例如：怎样让今天的自己放松一点？" /></label>
          <button className="discovery-primary" onClick={() => { setReading(drawTarot(topic, spread, question)); setRevealed([]); setCardIndex(0); onAction('think') }}><Sparkles size={16} />洗牌，开始探索</button>
        </> : <>
          <div className="tarot-reading-heading"><span>{reading.topic}{reading.question && ` · ${reading.question}`}</span><button onClick={() => { setReading(undefined); setRevealed([]) }}>重新洗牌</button></div>
          <div className={'tarot-cards' + (reading.spread === 'single' ? ' single' : '')}>{reading.draws.map((draw, i) => <div key={draw.position} className="tarot-card-slot"><span>{draw.position}</span><button className={'tarot-card' + (revealed.includes(i) ? ' revealed' : '') + (revealed.includes(i) && cardIndex === i ? ' selected' : '')} aria-label={revealed.includes(i) ? `${draw.position}：${draw.card.name}，${draw.reversed ? '逆位' : '正位'}` : `翻开${draw.position}的牌`} onClick={() => { setCardIndex(i); if (!revealed.includes(i)) { setRevealed([...revealed, i]); onAction(i === reading.draws.length - 1 ? 'heart' : 'nod') } }}>
            {revealed.includes(i) ? <><small>{String(draw.card.id).padStart(2, '0')}</small><div className={'tarot-face-symbol' + (draw.reversed ? ' reversed' : '')}><ContentIcon name={draw.card.symbol} size={37} /></div><strong>{draw.card.name}</strong><em>{draw.reversed ? '逆位' : '正位'}</em></> : <><Star size={13} /><span className="tarot-back-orbit"><Moon size={29} strokeWidth={1.1} /></span><small>轻点翻开</small></>}
          </button></div>)}</div>
          <p className="ritual-progress" role="status">{revealed.length ? `已翻开 ${revealed.length} / ${reading.draws.length} 张` : '慢慢来，选一张有感觉的牌。'}</p>
          {selectedDraw && revealed.includes(cardIndex) && <article className="tarot-interpretation" aria-live="polite"><span>{selectedDraw.card.keyword}</span><h2>{selectedDraw.card.name} · {selectedDraw.reversed ? '逆位' : '正位'}</h2><p>{selectedDraw.reversed ? selectedDraw.card.reversed : selectedDraw.card.upright}</p><blockquote>{selectedDraw.card.question}</blockquote><button className="discovery-text-button" onClick={askAboutReading}>和 Debby 聊聊这张牌<ArrowRight size={14} /></button></article>}
        </>}
        <p className="ritual-note">{ritualNote}</p>
      </div>}
      {feature.kind === 'oracle' && <div className="oracle-room">
        <div className="ritual-caption"><Sun size={14} />每日一签 · 娱乐小仪式</div>
        <label className="discovery-field">今日主题<select aria-label="今日签主题" value={topic} onChange={e => { setTopic(e.target.value as TarotTopic); setOracleOpen(false) }}>{tarotTopics.map(t => <option key={t}>{t}</option>)}</select></label>
        <article className={'oracle-paper' + (oracleOpen ? ' open' : '')}><span>{day} · {topic}</span>{oracleOpen ? <><div className="oracle-word">{oracle.word}</div><h2>{oracle.title}</h2><dl><div><dt>今日宜</dt><dd>{oracle.good}</dd></div><div><dt>轻提醒</dt><dd>{oracle.notice}</dd></div></dl><p>{oracle.step}</p></> : <><div className="oracle-word">签</div><h2>给今天一点温柔的灵感</h2><button className="discovery-primary" onClick={() => { setOracleOpen(true); onAction('bow') }}>翻开今日签</button></>}</article>
        {oracleOpen && <button className="discovery-text-button" onClick={() => onPrompt(`今天的娱乐签文是「${oracle.title}」，提示：${oracle.step}。我想从它聊聊自己的${topic}。不要预测未来，先问我一个温柔的问题。`)}>把这支签，聊成一个故事<ArrowRight size={14} /></button>}
        <p className="ritual-note">{ritualNote} 同日同主题签文保持一致。</p>
      </div>}
      {feature.kind === 'actions' && <div className="action-room"><p className="discovery-intro">选一个动作，看看左边的我。也可以在对话里直接叫我做。</p><div className="action-grid">{avatarActions.map(name => <button key={name} aria-label={`动作：${avatarActionInfo[name].label}`} onClick={() => { onAction(name); setNotice(avatarActionInfo[name].text) }}><span>{avatarActionInfo[name].label}</span><small>{avatarActionInfo[name].duration} 秒</small></button>)}</div><p className="action-caption" role="status">{notice || '今天想看哪一种心情？'}</p></div>}
      {feature.kind === 'checklist' && <div className="daily-room"><div className="daily-summary"><span>{day} · 开始前，先把心放稳</span><strong>{note.checks.length}<small> / {premarketChecklist.length}</small></strong></div><div className="premarket-list">{premarketChecklist.map((text, i) => <label key={text}><input type="checkbox" checked={note.checks.includes(i)} onChange={e => save({ ...note, checks: e.target.checked ? [...note.checks, i] : note.checks.filter(v => v !== i) })} /><span>{text}</span><Check size={15} aria-hidden="true" /></label>)}</div><p className="daily-quote">“不必每次都做点什么，按计划来就很好。”</p><button className="discovery-text-button" onClick={() => onPrompt('陪我做一份盘前观察计划。请逐项问我观察目标、信息来源、风险边界和暂停条件，不编造持仓或行情，不直接建议买卖。')}>和 Debby 一起整理计划<ArrowRight size={14} /></button><p className="local-save-status" role="status">{notice || '勾选后保存在这台电脑，每天重新开始。'}</p></div>}
      {feature.kind === 'journal' && <div className="journal-room"><span className="ritual-caption">{day} · 给今天留一页</span><label className="discovery-field">收盘后的心情<select aria-label="复盘心情" value={note.mood} onChange={e => setNote({ ...note, mood: e.target.value })}>{['平静', '开心', '疲惫', '焦虑', '有收获'].map(m => <option key={m}>{m}</option>)}</select></label><label className="discovery-field">今天学到的一件事<textarea aria-label="今天学到的一件事" rows={3} maxLength={1000} value={note.lesson} onChange={e => { setNote({ ...note, lesson: e.target.value }); setNotice('尚未保存') }} placeholder="我做了什么？依据是什么？有没有按计划来？" /></label><label className="discovery-field">下次想做的一点改变<textarea aria-label="下次的一点改变" rows={2} maxLength={1000} value={note.next} onChange={e => { setNote({ ...note, next: e.target.value }); setNotice('尚未保存') }} placeholder="一个小改进就够了。" /></label><div className="journal-actions"><button className="discovery-primary" onClick={() => { save(note); onAction('clap') }}>保存这页手记</button><button className="discovery-text-button" onClick={() => onPrompt(`陪我复盘今天。心情：${note.mood}。我的记录：${note.lesson || '还没有写'}。下次的改变：${note.next || '还没想好'}。请先倾听并问一个具体问题，不编造交易或持仓。`)}>和 Debby 聊聊<ArrowRight size={14} /></button></div><p className="local-save-status" role="status">{notice || '保存后仅留在这台电脑；点“聊聊”会把本页带入对话草稿。'}</p></div>}
      {feature.kind === 'relax' && <div className="relax-room"><p>屏幕可以等一会儿。<br />跟着圆圈，按舒服的节奏轻轻呼吸。</p><div className="breath-orbit" style={{ '--breath-scale': scale } as CSSProperties}><div /><span aria-live="polite">{breathLabel}</span></div><span className="breath-time">{Math.ceil(Math.max(0, 60 - elapsed))} 秒</span><button className="discovery-primary" onClick={() => { if (breathing) setBreathStart(undefined); else { const now = Date.now(); setClock(now); setBreathStart(now); onAction('stretch') } }}>{breathing ? '结束放松' : elapsed >= 60 ? '再陪我一分钟' : '开始一分钟'}</button><small>随时可以结束，或者用自己的呼吸节奏。</small></div>}
    </>}
  </section>
}
