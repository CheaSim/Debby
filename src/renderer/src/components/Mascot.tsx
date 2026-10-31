import { BellRing, Box, Cable, Ellipsis, GripVertical, MessageCircle, MousePointer2, Music2, PanelLeft, PersonStanding, Rotate3D, RotateCcw, ScanFace } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { stableIndexMood, moodIndexSymbol } from '../../../shared/domain'
import type { ProviderStatus, QuoteTick } from '../../../shared/types'
import type { PetBehavior } from '../../../shared/pet-behavior'
import type { PetMood } from '../../../shared/types'
import { platformApi } from '../platform-api'
import { ThreeDPet } from './ThreeDPet'
import { brand } from '../../../shared/brand'
import type { AgentShellState } from '../../../shared/shell'
import { agentStatusLabel } from './AgentConnectionDialog'
import type { DanceAsset, DanceCommand, DanceState } from '../../../shared/dance'
import { DanceSpeech } from './DanceSpeech'
import { avatarActionInfo, type AvatarCue } from '../../../shared/avatar'
import { LayeredPet } from './LayeredPet'
import type { LayeredAvatarAsset } from '../../../shared/layered-avatar'
import type { AvatarPerformance } from '../../../shared/avatar-performance'
import { debbyMoodLines } from '../../../shared/debby-character'
import { isPortraitRig } from '../../../shared/standrig-avatar'

interface MascotProps {
  performance?: AvatarPerformance
  layeredAsset?: LayeredAvatarAsset
  onAvatarStudio: () => void
  onLayeredError: (message: string) => void
  cue?: AvatarCue
  activity?: 'listening' | 'talking' | 'working'
  onDiscover: () => void
  dances: DanceState
  danceAsset?: DanceAsset
  onDanceStudio: () => void
  onDanceControl: (command: DanceCommand) => Promise<void>
  indexQuote?: QuoteTick
  providerStatus: ProviderStatus
  alerting: boolean
  panelOpen: boolean
  clickThrough: boolean
  onTogglePanel: () => void
  onQuickChat: () => void
  onClickThrough: () => void
  demo: boolean
  dialogue?: boolean
  mouthLevel?: number
  agentShell: AgentShellState
  onAgentConnect: () => void
}

const moodLabel = { idle: '平静', bullish: '开心', bearish: '担忧', alert: '提醒', offline: '等待' }
const behaviorText: Partial<Record<PetBehavior, string>> = {
  pat: '嘿嘿，收到你的鼓励啦。', lifted: '哇，轻一点点，我还在陪你呢。',
  land: '站稳啦！继续陪你。', greet: '我在呀！看行情，还是聊聊天？'
}

export function Mascot({ indexQuote, providerStatus, alerting, panelOpen, clickThrough, onTogglePanel, onQuickChat, onClickThrough, demo, dialogue, mouthLevel = 0, agentShell, onAgentConnect, dances, danceAsset, onDanceStudio, onDanceControl, cue, activity, onDiscover, layeredAsset, onAvatarStudio, onLayeredError, performance }: MascotProps): React.JSX.Element {
  const [now, setNow] = useState(Date.now)
  const previousMood = useRef<PetMood>('idle')
  const mood = stableIndexMood(indexQuote, previousMood.current, alerting, providerStatus, now)
  useEffect(() => { previousMood.current = mood }, [mood])
  const [behavior, setBehavior] = useState<PetBehavior>('idle')
  const direction = (indexQuote?.changePct ?? 0) >= 0 ? 'up' : 'down'
  const [portrait, setPortrait] = useState(true)
  const [viewReset, setViewReset] = useState(0)
  const [rotating, setRotating] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [chatHint, setChatHint] = useState(() => { try { return localStorage.getItem('debby:chat-intro') !== 'seen' } catch { return true } })
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
  const dancing = dances.playback && dances.library.find(e => e.id === dances.playback!.id)
  return (
    <section className={`mascot-stage mood-${mood}`} data-index-symbol={moodIndexSymbol} aria-label={`${brand.name}状态：${moodLabel[mood]}`} onContextMenu={(event) => { event.preventDefault(); optionsRef.current?.showPopover() }}>
      <div className={'speech' + (dancing ? ' dance-speech' : agentShell.controller ? ' agent-speech' : '')} data-task-status={agentShell.task?.status}>
        {dancing && dances.playback ? <DanceSpeech entry={dancing} playback={dances.playback} onControl={onDanceControl} /> : agentShell.controller ? <>
          <span className="speech-kicker"><span>{agentShell.controller.preview ? '本地演示' : agentShell.controller.name}</span><span className="agent-task-badge">{agentShell.task ? agentStatusLabel[agentShell.task.status] : '已连接'}</span></span>
          <strong>{agentShell.task?.title ?? '我准备好啦'}</strong>
          <p>{agentShell.caption?.text || '随时把进度告诉我吧。'}</p>
          {agentShell.task?.progress !== undefined && <progress aria-label="任务进度" value={agentShell.task.progress} max={1} />}
          <button className="agent-open" aria-label="查看 Agent 任务" title="查看 Agent 任务" onClick={onAgentConnect} />
        </> : <>
        <span className="speech-kicker"><span>{demo ? `${brand.name} · 演示数据` : brand.name}</span><span className="mood-badge"><i />{moodLabel[mood]}</span></span>
        <strong>{indexQuote ? `${indexQuote.name} ${direction === 'up' ? '+' : ''}${indexQuote.changePct.toFixed(2)}%` : '等待指数行情'}</strong>
        <p>{behaviorText[behavior] ?? (behavior in avatarActionInfo ? avatarActionInfo[behavior as keyof typeof avatarActionInfo].text : debbyMoodLines[mood])}</p>
        </>}
      </div>
      <div className="pet-wrap no-drag">
        {layeredAsset && !dancing ? <LayeredPet performance={performance} asset={layeredAsset} cue={cue} activity={activity} mood={mood} portrait={dialogue || portrait} draggable={!clickThrough && !dialogue} onBehavior={setBehavior} mouthLevel={mouthLevel} agentShell={agentShell} onError={onLayeredError} /> : <ThreeDPet performance={performance} cue={cue} activity={activity} mood={mood} portrait={dancing ? false : dialogue || portrait} viewReset={viewReset} rotating={dialogue ? false : rotating} draggable={!clickThrough && !dialogue} onBehavior={setBehavior} mouthLevel={mouthLevel} agentShell={agentShell} danceAsset={danceAsset} dancePlayback={dances.playback} />}
      </div>
      <div className="pet-tools no-drag">
        <span className="window-drag-handle" title="拖动桌宠" role="img" aria-label="拖动桌宠"><GripVertical size={14} /></span>
        <span className="dock-name"><i className={mood} /><strong>{brand.name}</strong></span>
        <button className="icon-button quick-chat-button" onClick={() => { setChatHint(false); try { localStorage.setItem('debby:chat-intro', 'seen') } catch {} onQuickChat() }} title="快速对话" aria-label="快速对话" aria-pressed={Boolean(dialogue)}><MessageCircle size={16} /><span aria-hidden="true">对话</span>{chatHint && !panelOpen && !agentShell.controller && <span className="quick-chat-hint" aria-hidden="true">点这里，问我一句</span>}</button>
        <button className="icon-button" onClick={onTogglePanel} title={panelOpen ? '收起行情面板' : '打开行情面板'}><PanelLeft size={17} /></button>
        <button className="icon-button" popoverTarget="pet-options" title="桌宠选项" aria-expanded={optionsOpen}><Ellipsis size={18} /></button>
        {alerting && <span className="alert-pulse"><BellRing size={14} /></span>}
      </div>
      <div ref={optionsRef} id="pet-options" popover="auto" className="pet-options no-drag" role="dialog" aria-label="桌宠选项" onToggle={(event) => setOptionsOpen((event.nativeEvent as ToggleEvent).newState === 'open')}>
        <header><strong>角色视图</strong><button className="ghost-icon" title="复位角色视角" onClick={() => setViewReset((value) => value + 1)}><RotateCcw size={15} /></button></header>
        <div className="avatar-views" role="group" aria-label="角色视图">
          <button className="icon-button" onClick={() => setPortrait(false)} title="全身视图" aria-pressed={!portrait}><PersonStanding size={17} /></button>
          <button className="icon-button" onClick={() => setPortrait(true)} title="上半身视图" aria-pressed={portrait}><ScanFace size={17} /></button>
        </div>
        <label className="switch-row" title={layeredAsset ? isPortraitRig(layeredAsset.rig) ? '此角色使用表情立绘' : '2.5D 使用目光跟随' : '旋转角色模式'}><Rotate3D size={16} /><span>{layeredAsset ? isPortraitRig(layeredAsset.rig) ? '表情立绘' : '2.5D · 目光跟随' : '旋转模式'}</span><input type="checkbox" disabled={Boolean(layeredAsset)} checked={!layeredAsset && rotating} onChange={(event) => setRotating(event.target.checked)} /><i /></label>
        <label className="switch-row" title={clickThrough ? '关闭鼠标穿透' : '开启鼠标穿透'}><MousePointer2 size={16} /><span>鼠标穿透</span><input type="checkbox" checked={clickThrough} onChange={onClickThrough} /><i /></label>
        <button className="menu-command" title="Agent 接入" onClick={() => { optionsRef.current?.hidePopover(); onAgentConnect() }}><Cable size={16} /><span>Agent 接入</span></button>
        <button className="menu-command" title="学跳舞" onClick={() => { optionsRef.current?.hidePopover(); onDanceStudio() }}><Music2 size={16} /><span>学跳舞</span></button>
        <button className="menu-command" title="角色工坊" onClick={() => { optionsRef.current?.hidePopover(); onAvatarStudio() }}><ScanFace size={16} /><span>角色工坊 · 2.5D 立绘</span></button>
        <button className="menu-command" title="发现更多陪伴" onClick={() => { optionsRef.current?.hidePopover(); onDiscover() }}><MessageCircle size={16} /><span>发现 · 塔罗与日常</span></button>
        {mateEngine.installed && <button className="menu-command" onClick={toggleMateEngine} title={mateEngine.running ? '关闭 Mate-Engine 独立窗口' : '打开 Mate-Engine 独立窗口'}><Box size={16} /><span>Mate-Engine</span></button>}
      </div>
    </section>
  )
}
