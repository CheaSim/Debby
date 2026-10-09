import { VideoOff } from 'lucide-react'
import { useEffect, useRef } from 'react'

export function CameraPreview({ stream, onOff }: { stream: MediaStream; onOff: () => void }): React.JSX.Element {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const element = video.current!
    element.srcObject = stream
    void element.play().catch(() => {})
    return () => { element.pause(); element.srcObject = null }
  }, [stream])
  return <div className="companion-camera" aria-label="摄像头已开启">
    <video ref={video} muted playsInline aria-label="本地摄像头预览" />
    <span><i />本轮照片</span><button className="ghost-icon" title="关闭摄像头" onClick={onOff}><VideoOff size={15} /></button>
  </div>
}
