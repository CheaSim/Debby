import { useEffect, useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { Mascot } from './components/Mascot'
import { useFinPetStore } from './store/use-finpet-store'
import { moodIndexSymbol } from '../../shared/domain'
import { platformApi } from './platform-api'
import { showcaseSceneSeconds, showcaseScenes, showcaseSnapshot, type ShowcaseScene } from '../../shared/showcase'
import { buildMarketRecap, type MarketRecap } from '../../shared/recap'
import { ShowcaseControls } from './components/ShowcaseControls'
import { RecapDialog } from './components/RecapDialog'

export function App(): React.JSX.Element {
  const state = useFinPetStore()
  const [scene, setScene] = useState<ShowcaseScene>()
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
      const targets = Array.from(document.querySelectorAll<HTMLElement>('.pet-tools, .avatar-error button, .mate-engine-tool, .compact-showcase'))
      const regions = targets.map((target) => {
        const rect = target.getBoundingClientRect()
        const x = Math.max(0, rect.left - 8)
        const y = Math.max(0, rect.top - 8)
        return { x, y, width: Math.min(window.innerWidth, rect.right + 8) - x, height: Math.min(window.innerHeight, rect.bottom + 8) - y }
      }).filter(({ width, height }) => width > 0 && height > 0)
      const serialized = JSON.stringify(regions)
      if (serialized !== previous) {
        previous = serialized
        void platformApi.setInteractiveRegions(regions)
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
    update()
    return () => { observer.disconnect(); mutations.disconnect(); window.removeEventListener('resize', update) }
  }, [state.ready, state.settings?.panelOpen])

  if (!state.ready || !state.settings) return <div className="boot-state">FinPet</div>
  const demo = scene ? showcaseSnapshot(scene, now) : undefined
  const quotes = demo?.quotes ?? state.quotes
  const provider = demo ? 'demo' : state.provider
  const providerName = demo ? '场景演示 · 非实盘' : state.providerName
  const providerStatus = demo?.providerStatus ?? state.providerStatus
  const indexQuote = quotes.find((quote) => quote.symbol === moodIndexSymbol)
  const currentRecap = buildMarketRecap(quotes, provider, providerName, providerStatus, now)
  return (
    <div className={state.settings.panelOpen ? 'app app-expanded' : 'app app-compact'}>
      {state.settings.panelOpen && <Dashboard
        settings={scene ? { ...state.settings, selectedSymbol: showcaseSymbol } : state.settings} quotes={quotes} provider={provider} providerName={providerName} providerStatus={providerStatus}
        onSelect={(symbol) => { if (scene) setShowcaseSymbol(symbol); else void state.selectSymbol(symbol) }}
        onSettings={(patch) => void state.updateSettings(patch)}
        onAddAlert={(symbol, direction, target) => void state.addAlert({ symbol, direction, target })}
        onRemoveAlert={(id) => void state.removeAlert(id)}
        onProviderUrl={(marketDataUrl) => void state.updateSettings({ marketDataUrl, marketSource: 'remote' })}
        showcasing={Boolean(scene)} onShowcase={() => { if (scene) exitShowcase(); else { chooseScene('bullish'); setPlaying(true) } }}
        onRecap={() => setRecap(currentRecap)} recapAvailable={Boolean(currentRecap)}
        showcaseControls={scene ? <ShowcaseControls scene={scene} playing={playing} onScene={chooseScene} onPlaying={setPlaying} onExit={exitShowcase} /> : undefined}
      />}
      <Mascot indexQuote={indexQuote} providerStatus={providerStatus} alerting={demo ? demo.alerting : Boolean(state.latestAlert)} panelOpen={state.settings.panelOpen} clickThrough={state.settings.clickThrough} demo={provider === 'demo'}
        onTogglePanel={() => void state.togglePanel()} onClickThrough={() => void state.setClickThrough(!state.settings?.clickThrough)} />
      {scene && !state.settings.panelOpen && <div className="compact-showcase no-drag"><ShowcaseControls scene={scene} playing={playing} onScene={chooseScene} onPlaying={setPlaying} onExit={exitShowcase} /></div>}
      {demo?.alerting && <div className="toast-alert demo-alert no-drag"><strong>演示提醒 · 非实盘</strong><span>模拟上证指数突破目标价，不触发系统通知。</span></div>}
      {!demo && state.latestAlert && <div className="toast-alert no-drag"><strong>价格提醒</strong><span>{state.latestAlert.message}</span></div>}
      {recap && <RecapDialog recap={recap} onClose={() => setRecap(null)} />}
    </div>
  )
}
