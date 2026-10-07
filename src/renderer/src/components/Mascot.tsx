import { BellRing, Box, ChevronLeft, ChevronRight, Move, MousePointer2, PanelRightOpen, PersonStanding, Rotate3D, RotateCcw, ScanFace } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { stableIndexMood, moodIndexSymbol } from '../../../shared/domain'
import type { ProviderStatus, QuoteTick } from '../../../shared/types'
import type { PetBehavior } from '../../../shared/pet-behavior'
import type { PetMood } from '../../../shared/types'
import { platformApi } from '../platform-api'
import { ThreeDPet } from './ThreeDPet'

interface MascotProps {
  indexQuote?: QuoteTick
  providerStatus: ProviderStatus
  alerting: boolean
  panelOpen: boolean
  clickThrough: boolean
  onTogglePanel: () => void
  onClickThrough: () => void
  demo: boolean
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

export function Mascot({ indexQuote, providerStatus, alerting, panelOpen, clickThrough, onTogglePanel, onClickThrough, demo }: MascotProps): React.JSX.Element {
  const [now, setNow] = useState(Date.now)
  const previousMood = useRef<PetMood>('idle')
  const mood = stableIndexMood(indexQuote, previousMood.current, alerting, providerStatus, now)
  useEffect(() => { previousMood.current = mood }, [mood])
  const [behavior, setBehavior] = useState<PetBehavior>('idle')
  const direction = (indexQuote?.changePct ?? 0) >= 0 ? 'up' : 'down'
  const [portrait, setPortrait] = useState(false)
  const [viewReset, setViewReset] = useState(0)
  const [rotating, setRotating] = useState(false)
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
    <section className={`mascot-stage mood-${mood}`} data-index-symbol={moodIndexSymbol} aria-label={`财仔状态：${moodLabel[mood]}`}>
      <div className="speech">
        <span className="speech-kicker"><span>{demo ? '财仔 · 演示数据' : '财仔'}</span><span className="mood-badge"><i />{moodLabel[mood]}</span></span>
        <strong>{indexQuote ? `${indexQuote.name} ${direction === 'up' ? '+' : ''}${indexQuote.changePct.toFixed(2)}%` : '等待指数行情'}</strong>
        <p>{behaviorText[behavior] ?? moodText[mood]}</p>
      </div>
      <div className="pet-wrap no-drag">
        <ThreeDPet mood={mood} portrait={portrait} viewReset={viewReset} rotating={rotating} draggable={!clickThrough} onBehavior={setBehavior} />
        <div className="pet-nameplate" aria-hidden="true"><strong>财仔</strong><span>FINPET</span></div>
      </div>
      <div className="pet-tools no-drag">
        <span className="window-drag-handle" title="拖动桌宠" role="img" aria-label="拖动桌宠"><Move size={16} /></span>
        <button className="icon-button" onClick={onClickThrough} title={clickThrough ? '关闭鼠标穿透' : '开启鼠标穿透'} aria-pressed={clickThrough}><MousePointer2 size={17} /></button>
        <div className="avatar-views" role="group" aria-label="角色视图">
          <button className="icon-button" onClick={() => setPortrait(false)} title="全身视图" aria-pressed={!portrait}><PersonStanding size={17} /></button>
          <button className="icon-button" onClick={() => setPortrait(true)} title="近景视图" aria-pressed={portrait}><ScanFace size={17} /></button>
        </div>
        <button className="icon-button" onClick={() => setRotating((value) => !value)} title="旋转角色模式" aria-pressed={rotating}><Rotate3D size={17} /></button>
        <button className="icon-button" onClick={() => setViewReset((value) => value + 1)} title="复位角色视角"><RotateCcw size={16} /></button>
        <button className="primary-orb" onClick={onTogglePanel} title={panelOpen ? '收起行情面板' : '打开行情面板'}>
          {panelOpen ? <PanelRightOpen size={18} /> : <ChevronRight size={20} />}
        </button>
        {alerting && <span className="alert-pulse"><BellRing size={16} /></span>}
      </div>
      {mateEngine.installed && <button className="icon-button mate-engine-tool no-drag" onClick={toggleMateEngine} title={mateEngine.running ? '关闭 Mate-Engine 独立窗口' : '打开 Mate-Engine 独立窗口'}><Box size={16} /></button>}
      {panelOpen && <button className="collapse-tab no-drag" onClick={onTogglePanel} title="收起行情面板"><ChevronLeft size={18} /></button>}
    </section>
  )
}
