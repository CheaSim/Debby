import { useEffect } from 'react'
import { Dashboard } from './components/Dashboard'
import { Mascot } from './components/Mascot'
import { useFinPetStore } from './store/use-finpet-store'
import { moodIndexSymbol } from '../../shared/domain'

export function App(): React.JSX.Element {
  const state = useFinPetStore()
  useEffect(() => {
    let dispose: (() => void) | undefined
    let cancelled = false
    void state.initialize().then((cleanup) => { if (cancelled) cleanup(); else dispose = cleanup })
    return () => { cancelled = true; dispose?.() }
  }, [])

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
      <Mascot indexQuote={indexQuote} providerStatus={state.providerStatus} alerting={Boolean(state.latestAlert)} panelOpen={state.settings.panelOpen}
        onTogglePanel={() => void state.togglePanel()} onClickThrough={() => void state.setClickThrough(true)} />
      {state.latestAlert && <div className="toast-alert no-drag"><strong>价格提醒</strong><span>{state.latestAlert.message}</span></div>}
    </div>
  )
}
