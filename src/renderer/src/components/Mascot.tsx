import { BellRing, Box, Ellipsis, GripVertical, MousePointer2, PanelLeft, PersonStanding, Rotate3D, RotateCcw, ScanFace } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { stableIndexMood, moodIndexSymbol } from '../../../shared/domain'
import type { ProviderStatus, QuoteTick } from '../../../shared/types'
import type { PetBehavior } from '../../../shared/pet-behavior'
import type { PetMood } from '../../../shared/types'
import { platformApi } from '../platform-api'
import { ThreeDPet } from './ThreeDPet'
import { brand } from '../../../shared/brand'

interface MascotProps {
  indexQuote?: QuoteTick
  providerStatus: ProviderStatus
  alerting: boolean
  panelOpen: boolean
  clickThrough: boolean
  onTogglePanel: () => void
  onClickThrough: () => void
  demo: boolean
  dialogue?: boolean
}

const moodText = {
  idle: '今天也陪你认真盯盘。',
  bullish: '涨得不错，开心也要守纪律呀。',
  bearish: '先别慌，我陪你看看计划。',
  alert: '价格提醒命中，快来看看！',
  offline: '行情走丢了，等它回来再判断。'
}

const moodLabel = { idle: '平静', bullish: '开心', bearish: '担忧', alert: '提醒', offline: '等待' }
const behaviorText: Partial<Record<PetBehavior, string>> = {
  pat: '嗯，收到你的鼓励啦。', lifted: '轻一点，我还在陪你呢。',
  land: '站稳啦，继续陪你。', greet: '我在呢，今天也按计划来。'
}

export function Mascot({ indexQuote, providerStatus, alerting, panelOpen, clickThrough, onTogglePanel, onClickThrough, demo, dialogue }: MascotProps): React.JSX.Element {
  const [now, setNow] = useState(Date.now)
  const previousMood = useRef<PetMood>('idle')
  const mood = stableIndexMood(indexQuote, previousMood.current, alerting, providerStatus, now)
  useEffect(() => { previousMood.current = mood }, [mood])
  const [behavior, setBehavior] = useState<PetBehavior>('idle')
  const direction = (indexQuote?.changePct ?? 0) >= 0 ? 'up' : 'down'
  const [portrait, setPortrait] = useState(false)
  const [viewReset, setViewReset] = useState(0)
  const [rotating, setRotating] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const optionsRef = useRef<HTMLDivElement>(null)
  const [mateEngine, setMateEngine] = useState<{ installed: boolean; running: boolean }>({ installed: false, running: false })
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    let active = true
    const refresh = (): void => { void platformApi.getMateEngineStatus().then((status) => { if (active) setMateEngine(status) }) }
    refresh()
    const timer = window.setInterval(refresh, 2_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])
  const toggleMateEngine = (): void => {
    void (mateEngine.running ? platformApi.stopMateEngine() : platformApi.startMateEngine()).then(setMateEngine)
  }
  return (
    <section className={`mascot-stage mood-${mood}`} data-index-symbol={moodIndexSymbol} aria-label={`${brand.name}状态：${moodLabel[mood]}`} onContextMenu={(event) => { event.preventDefault(); optionsRef.current?.showPopover() }}>
      <div className="speech">
        <span className="speech-kicker"><span>{demo ? `${brand.name} · 演示数据` : brand.name}</span><span className="mood-badge"><i />{moodLabel[mood]}</span></span>
        <strong>{indexQuote ? `${indexQuote.name} ${direction === 'up' ? '+' : ''}${indexQuote.changePct.toFixed(2)}%` : '等待指数行情'}</strong>
        <p>{behaviorText[behavior] ?? moodText[mood]}</p>
      </div>
      <div className="pet-wrap no-drag">
        <ThreeDPet mood={mood} portrait={dialogue || portrait} viewReset={viewReset} rotating={dialogue ? false : rotating} draggable={!clickThrough && !dialogue} onBehavior={setBehavior} />
      </div>
      <div className="pet-tools no-drag">
        <span className="window-drag-handle" title="拖动桌宠" role="img" aria-label="拖动桌宠"><GripVertical size={14} /></span>
        <span className="dock-name"><i className={mood} /><strong>{brand.name}</strong></span>
        <button className="icon-button" onClick={onTogglePanel} title={panelOpen ? '收起行情面板' : '打开行情面板'}><PanelLeft size={17} /></button>
        <button className="icon-button" popoverTarget="pet-options" title="桌宠选项" aria-expanded={optionsOpen}><Ellipsis size={18} /></button>
        {alerting && <span className="alert-pulse"><BellRing size={14} /></span>}
      </div>
      <div ref={optionsRef} id="pet-options" popover="auto" className="pet-options no-drag" role="dialog" aria-label="桌宠选项" onToggle={(event) => setOptionsOpen((event.nativeEvent as ToggleEvent).newState === 'open')}>
        <header><strong>角色视图</strong><button className="ghost-icon" title="复位角色视角" onClick={() => setViewReset((value) => value + 1)}><RotateCcw size={15} /></button></header>
        <div className="avatar-views" role="group" aria-label="角色视图">
          <button className="icon-button" onClick={() => setPortrait(false)} title="全身视图" aria-pressed={!portrait}><PersonStanding size={17} /></button>
          <button className="icon-button" onClick={() => setPortrait(true)} title="近景视图" aria-pressed={portrait}><ScanFace size={17} /></button>
        </div>
        <label className="switch-row" title="旋转角色模式"><Rotate3D size={16} /><span>旋转模式</span><input type="checkbox" checked={rotating} onChange={(event) => setRotating(event.target.checked)} /><i /></label>
        <label className="switch-row" title={clickThrough ? '关闭鼠标穿透' : '开启鼠标穿透'}><MousePointer2 size={16} /><span>鼠标穿透</span><input type="checkbox" checked={clickThrough} onChange={onClickThrough} /><i /></label>
        {mateEngine.installed && <button className="menu-command" onClick={toggleMateEngine} title={mateEngine.running ? '关闭 Mate-Engine 独立窗口' : '打开 Mate-Engine 独立窗口'}><Box size={16} /><span>Mate-Engine</span></button>}
      </div>
    </section>
  )
}
