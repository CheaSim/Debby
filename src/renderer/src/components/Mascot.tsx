import { BellRing, ChevronLeft, ChevronRight, MousePointer2, PanelRightOpen } from 'lucide-react'
import { moodForQuote } from '../../../shared/domain'
import type { QuoteTick } from '../../../shared/types'
import { Live2DPet } from './Live2DPet'

interface MascotProps {
  quote?: QuoteTick
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

export function Mascot({ quote, alerting, panelOpen, onTogglePanel, onClickThrough }: MascotProps): React.JSX.Element {
  const mood = moodForQuote(quote, alerting)
  const direction = (quote?.changePct ?? 0) >= 0 ? 'up' : 'down'
  return (
    <section className={`mascot-stage mood-${mood}`} aria-label={`财仔状态：${mood}`}>
      <div className="drag-handle" aria-hidden="true" />
      <div className="speech">
        <span className="speech-kicker">财仔</span>
        <strong>{quote ? `${quote.name} ${direction === 'up' ? '+' : ''}${quote.changePct.toFixed(2)}%` : '等待行情'}</strong>
        <p>{moodText[mood]}</p>
      </div>
      <div className="pet-wrap no-drag">
        <div className="market-ribbon" aria-hidden="true">
          <span>{direction === 'up' ? '↗' : '↘'}</span>
          <i />
          <i />
          <i />
        </div>
        <Live2DPet mood={mood} />
        <div className="pet-nameplate" aria-hidden="true"><strong>财仔</strong><span>FINPET</span></div>
      </div>
      <div className="pet-tools no-drag">
        <button className="icon-button" onClick={onClickThrough} title="开启鼠标穿透"><MousePointer2 size={17} /></button>
        <button className="primary-orb" onClick={onTogglePanel} title={panelOpen ? '收起行情面板' : '打开行情面板'}>
          {panelOpen ? <PanelRightOpen size={18} /> : <ChevronRight size={20} />}
        </button>
        {alerting && <span className="alert-pulse"><BellRing size={16} /></span>}
      </div>
      {panelOpen && <button className="collapse-tab no-drag" onClick={onTogglePanel} title="收起行情面板"><ChevronLeft size={18} /></button>}
    </section>
  )
}
