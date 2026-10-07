import { BellRing, Box, ChevronLeft, ChevronRight, MousePointer2, PanelRightOpen, PersonStanding, RotateCcw, ScanFace } from 'lucide-react'
import { useEffect, useState } from 'react'
import { moodForIndex, moodIndexSymbol } from '../../../shared/domain'
import type { ProviderStatus, QuoteTick } from '../../../shared/types'
import { platformApi } from '../platform-api'
import { ThreeDPet } from './ThreeDPet'

interface MascotProps {
  indexQuote?: QuoteTick
  providerStatus: ProviderStatus
  alerting: boolean
  panelOpen: boolean
  onTogglePanel: () => void
  onClickThrough: () => void
}

const moodText = {
  idle: '今天也陪你认真盯盘。',
  bullish: '涨得不错，开心也要守纪律呀。',
  bearish: '先别慌，我陪你看看计划。',
  alert: '价格提醒命中，快来看看！',
  offline: '行情走丢了，等它回来再判断。'
}

const moodLabel = { idle: '平静', bullish: '开心', bearish: '担忧', alert: '提醒', offline: '等待' }

export function Mascot({ indexQuote, providerStatus, alerting, panelOpen, onTogglePanel, onClickThrough }: MascotProps): React.JSX.Element {
  const [now, setNow] = useState(Date.now)
  const mood = moodForIndex(indexQuote, alerting, providerStatus, now)
  const direction = (indexQuote?.changePct ?? 0) >= 0 ? 'up' : 'down'
  const [portrait, setPortrait] = useState(false)
  const [viewReset, setViewReset] = useState(0)
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
      <div className="drag-handle" aria-hidden="true" />
      <div className="speech">
        <span className="speech-kicker"><span>财仔</span><span className="mood-badge"><i />{moodLabel[mood]}</span></span>
        <strong>{indexQuote ? `${indexQuote.name} ${direction === 'up' ? '+' : ''}${indexQuote.changePct.toFixed(2)}%` : '等待指数行情'}</strong>
        <p>{moodText[mood]}</p>
      </div>
      <div className="pet-wrap no-drag">
        <ThreeDPet mood={mood} portrait={portrait} viewReset={viewReset} />
        <div className="pet-nameplate" aria-hidden="true"><strong>财仔</strong><span>FINPET</span></div>
      </div>
      <div className="pet-tools no-drag">
        <button className="icon-button" onClick={onClickThrough} title="开启鼠标穿透"><MousePointer2 size={17} /></button>
        <div className="avatar-views" role="group" aria-label="角色视图">
          <button className="icon-button" onClick={() => setPortrait(false)} title="全身视图" aria-pressed={!portrait}><PersonStanding size={17} /></button>
          <button className="icon-button" onClick={() => setPortrait(true)} title="近景视图" aria-pressed={portrait}><ScanFace size={17} /></button>
        </div>
        <button className="icon-button" onClick={() => setViewReset((value) => value + 1)} title="复位角色视角"><RotateCcw size={16} /></button>
        {mateEngine.installed && <button className="icon-button" onClick={toggleMateEngine} title={mateEngine.running ? '关闭 Mate-Engine 独立窗口' : '打开 Mate-Engine 独立窗口'}><Box size={16} /></button>}
        <button className="primary-orb" onClick={onTogglePanel} title={panelOpen ? '收起行情面板' : '打开行情面板'}>
          {panelOpen ? <PanelRightOpen size={18} /> : <ChevronRight size={20} />}
        </button>
        {alerting && <span className="alert-pulse"><BellRing size={16} /></span>}
      </div>
      {panelOpen && <button className="collapse-tab no-drag" onClick={onTogglePanel} title="收起行情面板"><ChevronLeft size={18} /></button>}
    </section>
  )
}
