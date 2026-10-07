import { useEffect } from 'react'
import { Dashboard } from './components/Dashboard'
import { Mascot } from './components/Mascot'
import { useFinPetStore } from './store/use-finpet-store'
import { moodIndexSymbol } from '../../shared/domain'
import { platformApi } from './platform-api'

export function App(): React.JSX.Element {
  const state = useFinPetStore()
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
      const targets = Array.from(document.querySelectorAll<HTMLElement>('.pet-tools, .avatar-error button, .mate-engine-tool'))
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
    if (stage) mutations.observe(stage, { childList: true, subtree: true })
    window.addEventListener('resize', update)
    update()
    return () => { observer.disconnect(); mutations.disconnect(); window.removeEventListener('resize', update) }
  }, [state.ready, state.settings?.panelOpen])

  if (!state.ready || !state.settings) return <div className="boot-state">FinPet</div>
  const indexQuote = state.quotes.find((quote) => quote.symbol === moodIndexSymbol)
  return (
    <div className={state.settings.panelOpen ? 'app app-expanded' : 'app app-compact'}>
      {state.settings.panelOpen && <Dashboard
        settings={state.settings} quotes={state.quotes} provider={state.provider} providerName={state.providerName} providerStatus={state.providerStatus}
        onSelect={(symbol) => void state.selectSymbol(symbol)}
        onSettings={(patch) => void state.updateSettings(patch)}
        onAddAlert={(symbol, direction, target) => void state.addAlert({ symbol, direction, target })}
        onRemoveAlert={(id) => void state.removeAlert(id)}
        onProviderUrl={(marketDataUrl) => void state.updateSettings({ marketDataUrl, marketSource: 'remote' })}
      />}
      <Mascot indexQuote={indexQuote} providerStatus={state.providerStatus} alerting={Boolean(state.latestAlert)} panelOpen={state.settings.panelOpen} clickThrough={state.settings.clickThrough}
        onTogglePanel={() => void state.togglePanel()} onClickThrough={() => void state.setClickThrough(!state.settings?.clickThrough)} />
      {state.latestAlert && <div className="toast-alert no-drag"><strong>价格提醒</strong><span>{state.latestAlert.message}</span></div>}
    </div>
  )
}
