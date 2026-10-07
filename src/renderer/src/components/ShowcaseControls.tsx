import { Pause, Play, RotateCcw, X } from 'lucide-react'
import { showcaseLabels, showcaseScenes, type ShowcaseScene } from '../../../shared/showcase'

interface ShowcaseControlsProps {
  scene?: ShowcaseScene
  playing: boolean
  onScene: (scene: ShowcaseScene) => void
  onPlaying: (playing: boolean) => void
  onExit: () => void
}

export function ShowcaseControls({ scene, playing, onScene, onPlaying, onExit }: ShowcaseControlsProps): React.JSX.Element {
  return (
    <div className="showcase-controls no-drag" data-showcase-scene={scene}>
      <strong>演示数据</strong>
      <select aria-label="演示场景" value={scene} onChange={(event) => onScene(event.target.value as ShowcaseScene)}>
        {showcaseScenes.map((value) => <option key={value} value={value}>{showcaseLabels[value]}</option>)}
      </select>
      <button className="ghost-icon" title={playing ? '暂停演示' : '播放演示'} onClick={() => onPlaying(!playing)}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
      <button className="ghost-icon" title="重播演示" onClick={() => { onScene('bullish'); onPlaying(true) }}><RotateCcw size={15} /></button>
      <button className="ghost-icon" title="退出演示" onClick={onExit}><X size={15} /></button>
    </div>
  )
}
