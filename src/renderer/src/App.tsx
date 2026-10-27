import { useEffect, useRef, useState } from 'react'
import { Dashboard, type DashboardTab } from './components/Dashboard'
import { Mascot } from './components/Mascot'
import { useFinPetStore } from './store/use-finpet-store'
import { moodIndexSymbol } from '../../shared/domain'
import { platformApi } from './platform-api'
import { showcaseSceneSeconds, showcaseScenes, showcaseSnapshot, type ShowcaseScene } from '../../shared/showcase'
import { buildMarketRecap, type MarketRecap } from '../../shared/recap'
import { ShowcaseControls } from './components/ShowcaseControls'
import { RecapDialog } from './components/RecapDialog'
import { brand } from '../../shared/brand'
import { useDebbyChat } from './hooks/use-debby-chat'
import { useVoiceCompanion } from './hooks/use-voice-companion'
import { useAgentShell } from './hooks/use-agent-shell'
import { AgentConnectionDialog } from './components/AgentConnectionDialog'
import { useReadAloud } from './hooks/use-read-aloud'
import { useDancePlayer } from './hooks/use-dance-player'
import { DanceStudio } from './components/DanceStudio'
import type { AvatarAction, AvatarCue } from '../../shared/avatar'
import './discovery.css'
import './avatar-studio.css'
import { AvatarStudio } from './components/AvatarStudio'
import { useLayeredAvatar } from './hooks/use-layered-avatar'

export function App(): React.JSX.Element {
  const state = useFinPetStore()
  const chat = useDebbyChat()
  const agentShell = useAgentShell()
  const dancer = useDancePlayer()
  const layeredAvatar = useLayeredAvatar()
  const [avatarStudio, setAvatarStudio] = useState(false)
  const [danceStudio, setDanceStudio] = useState(false)
  const [agentDialog, setAgentDialog] = useState(false)
  const [panelTab, setPanelTab] = useState<DashboardTab>('market')
  const [avatarCue, setAvatarCue] = useState<AvatarCue>()
  const cueId = useRef(0)
  const [chatDraft, setChatDraft] = useState<{ id: number; text: string }>()
  const draftId = useRef(0)
  useEffect(() => platformApi.onAvatarAction(cue => setAvatarCue({ id: ++cueId.current, name: cue.name })), [])
  const performAction = (name: AvatarAction): void => {
    void (async () => {
      if (dancer.state.playback) await dancer.control({ action: 'stop' })
      setAvatarCue({ id: ++cueId.current, name })
    })().catch(() => { /* The dance controller presents its error in the existing toast. */ })
  }
  const openDiscovery = async (): Promise<void> => {
    setScene(undefined); setPlaying(false); setRecap(null)
    if (dancer.state.playback) await dancer.control({ action: 'stop' })
    if (!state.settings?.panelOpen) await state.togglePanel()
    setPanelTab('discover')
  }
  const openDanceStudio = (): void => {
    exitShowcase(); setPanelTab('market'); setDanceStudio(true)
    void platformApi.stopVoice(); void platformApi.cancelReadAloud()
    if (!state.settings?.panelOpen) void state.togglePanel()
  }
  const activeDance = dancer.state.playback?.id
  useEffect(() => {
    if (!activeDance) return
    setDanceStudio(false); setPanelTab('market')
    if (state.settings?.panelOpen) void state.togglePanel()
  }, [activeDance])
  const dialogue = panelTab === 'chat'
  const [chatFocusRequest, setChatFocusRequest] = useState(0)
  const openingChat = useRef(false)
  useEffect(() => { if (!state.settings?.panelOpen) setPanelTab('market') }, [state.settings?.panelOpen])
  const openQuickChat = async (): Promise<void> => {
    if (openingChat.current) return
    openingChat.current = true
    try {
      setScene(undefined); setPlaying(false); setRecap(null)
      if (dancer.state.playback) await dancer.control({ action: 'stop' })
      if (!state.settings?.panelOpen) await state.togglePanel()
      setPanelTab('chat')
      setChatFocusRequest((value) => value + 1)
    } finally { openingChat.current = false }
  }
  const [scene, setScene] = useState<ShowcaseScene>()
  const companion = useVoiceCompanion(Boolean(state.settings?.panelOpen && dialogue && !scene))
  const reader = useReadAloud(Boolean(state.settings?.panelOpen && dialogue && !scene))
  const [playing, setPlaying] = useState(false)
  const [replay, setReplay] = useState(0)
  const [now, setNow] = useState(Date.now)
  const [recap, setRecap] = useState<MarketRecap | null>(null)
  const [showcaseSymbol, setShowcaseSymbol] = useState(moodIndexSymbol)
  const chooseScene = (value: ShowcaseScene): void => { setScene(value); setPlaying(false); setRecap(null); setReplay((value) => value + 1) }
  const exitShowcase = (): void => { setScene(undefined); setPlaying(false); setRecap(null) }
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!scene || !playing) return
    const timer = window.setTimeout(() => {
      const index = showcaseScenes.indexOf(scene)
      if (index === showcaseScenes.length - 1) setPlaying(false)
      else setScene(showcaseScenes[index + 1])
    }, showcaseSceneSeconds * 1_000)
    return () => window.clearTimeout(timer)
  }, [scene, playing, replay])
  useEffect(() => {
    let dispose: (() => void) | undefined
    let cancelled = false
    void state.initialize().then((cleanup) => { if (cancelled) cleanup(); else dispose = cleanup })
    return () => { cancelled = true; dispose?.() }
  }, [])

  useEffect(() => {
    if (!state.ready) return
    let previous = ''
    const update = (): void => {
      const targets = Array.from(document.querySelectorAll<HTMLElement>('.pet-tools, .avatar-error button, .pet-options:popover-open, .compact-showcase, .agent-speech, .agent-dialog, .dance-speech, .dance-dialog, .avatar-studio'))
      const regions = targets.map((target) => {
        const rect = target.getBoundingClientRect()
        const x = Math.max(0, rect.left - 8)
        const y = Math.max(0, rect.top - 8)
        return { x, y, width: Math.min(window.innerWidth, rect.right + 8) - x, height: Math.min(window.innerHeight, rect.bottom + 8) - y }
      }).filter(({ width, height }) => width > 0 && height > 0)
      const serialized = JSON.stringify(regions)
      if (serialized !== previous) {
        previous = serialized
        // Native panel resizing and DOM resizing cross IPC independently. Retry a stale size.
        void platformApi.setInteractiveRegions(regions).catch(() => { previous = ''; window.requestAnimationFrame(update) })
      }
    }
    const observer = new ResizeObserver(update)
    const stage = document.querySelector('.mascot-stage')
    const tools = document.querySelector('.pet-tools')
    if (stage) observer.observe(stage)
    if (tools) observer.observe(tools)
    const mutations = new MutationObserver(update)
    const app = document.querySelector('.app')
    if (app) mutations.observe(app, { childList: true, subtree: true })
    window.addEventListener('resize', update)
    document.addEventListener('toggle', update, true)
    update()
    return () => { observer.disconnect(); mutations.disconnect(); window.removeEventListener('resize', update); document.removeEventListener('toggle', update, true) }
  }, [state.ready, state.settings?.panelOpen])

  if (!state.ready || !state.settings) return <div className="boot-state">{brand.name}</div>
  const demo = scene ? showcaseSnapshot(scene, now) : undefined
  const quotes = demo?.quotes ?? state.quotes
  const provider = demo ? 'demo' : state.provider
  const providerName = demo ? '场景演示 · 非实盘' : state.providerName
  const providerStatus = demo?.providerStatus ?? state.providerStatus
  const indexQuote = quotes.find((quote) => quote.symbol === moodIndexSymbol)
  const currentRecap = buildMarketRecap(quotes, provider, providerName, providerStatus, now)
  return (
    <div className={(state.settings.panelOpen ? 'app app-expanded' : 'app app-compact') + (state.settings.panelOpen && dialogue ? ' app-dialogue' : '') + (state.settings.panelOpen && panelTab === 'discover' ? ' app-discover' : '')}>
      {state.settings.panelOpen && <Dashboard
        settings={scene ? { ...state.settings, selectedSymbol: showcaseSymbol } : state.settings} quotes={quotes} provider={provider} providerName={providerName} providerStatus={providerStatus}
        onSelect={(symbol) => { if (scene) setShowcaseSymbol(symbol); else void state.selectSymbol(symbol) }}
        onSettings={(patch) => void state.updateSettings(patch)}
        onAddAlert={(symbol, direction, target) => void state.addAlert({ symbol, direction, target })}
        onRemoveAlert={(id) => void state.removeAlert(id)}
        onProviderUrl={(marketDataUrl) => void state.updateSettings({ marketDataUrl, marketSource: 'remote' })}
        showcasing={Boolean(scene)} onShowcase={() => { if (scene) exitShowcase(); else { chooseScene('bullish'); setPlaying(true) } }}
        onClose={() => void state.togglePanel()}
        onRecap={() => setRecap(currentRecap)} recapAvailable={Boolean(currentRecap)}
        chat={chat} companion={companion} reader={reader} tab={panelTab} onTabChange={setPanelTab} chatFocusRequest={chatFocusRequest} onAgentConnect={() => setAgentDialog(true)}
        chatDraft={chatDraft} onAvatarAction={performAction} onDanceStudio={openDanceStudio} onPrompt={text => { setChatDraft({ id: ++draftId.current, text }); void openQuickChat() }}
        showcaseControls={scene ? <ShowcaseControls scene={scene} playing={playing} onScene={chooseScene} onPlaying={setPlaying} onExit={exitShowcase} /> : undefined}
      />}
      <Mascot indexQuote={indexQuote} providerStatus={providerStatus} alerting={demo ? demo.alerting : Boolean(state.latestAlert)} panelOpen={state.settings.panelOpen} clickThrough={state.settings.clickThrough} demo={provider === 'demo'} dialogue={state.settings.panelOpen && dialogue} mouthLevel={Math.max(companion.mouth, reader.mouth)}
        cue={avatarCue} activity={companion.recording !== 'off' ? 'listening' : companion.speaking || reader.speaking ? 'talking' : chat.state.busy || companion.busy ? 'working' : undefined} onDiscover={() => void openDiscovery().catch(() => {})}
        onTogglePanel={() => void state.togglePanel()} onQuickChat={() => void openQuickChat()} onClickThrough={() => void state.setClickThrough(!state.settings?.clickThrough)} agentShell={agentShell} onAgentConnect={() => setAgentDialog(true)}
        layeredAsset={layeredAvatar.selected ? layeredAvatar.asset : undefined} onLayeredError={layeredAvatar.failed} onAvatarStudio={() => { exitShowcase(); setDanceStudio(false); setAvatarStudio(true); void platformApi.stopVoice(); void platformApi.cancelReadAloud(); if (!state.settings?.panelOpen) void state.togglePanel() }}
        dances={dancer.state} danceAsset={dancer.asset} onDanceControl={dancer.control} onDanceStudio={openDanceStudio} />
      {avatarStudio && <AvatarStudio avatar={layeredAvatar} onClose={() => setAvatarStudio(false)} />}
      {layeredAvatar.error && !avatarStudio && <div className="dance-error-toast no-drag" role="alert">{layeredAvatar.error}</div>}
      {danceStudio && <DanceStudio state={dancer.state} onClose={() => setDanceStudio(false)} onPlay={async (id, speed, loop) => {
        await dancer.control({ action: 'play', id, speed, loop }); setDanceStudio(false)
      }} />}
      {dancer.error && !danceStudio && <div className="dance-error-toast no-drag" role="alert">{dancer.error}</div>}
      {agentDialog && <AgentConnectionDialog state={agentShell} onClose={() => setAgentDialog(false)} />}
      {scene && !state.settings.panelOpen && <div className="compact-showcase no-drag"><ShowcaseControls scene={scene} playing={playing} onScene={chooseScene} onPlaying={setPlaying} onExit={exitShowcase} /></div>}
      {demo?.alerting && <div className="toast-alert demo-alert no-drag"><strong>演示提醒 · 非实盘</strong><span>模拟上证指数突破目标价，不触发系统通知。</span></div>}
      {!demo && state.latestAlert && <div className="toast-alert no-drag"><strong>价格提醒</strong><span>{state.latestAlert.message}</span></div>}
      {recap && <RecapDialog recap={recap} onClose={() => setRecap(null)} />}
    </div>
  )
}
