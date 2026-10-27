import { useEffect, useRef, useState } from 'react'
import type { LayeredAvatarAsset } from '../../../shared/layered-avatar'
import { Anime25DBackend, type LayeredAvatarBackend } from '../avatar/layered-runtime'
import { IndexedDbAvatarStore, type LayeredAvatarStore } from '../avatar/layered-store'
const defaultStore = new IndexedDbAvatarStore(), defaultBackend = new Anime25DBackend()
export function useLayeredAvatar(store: LayeredAvatarStore = defaultStore, backend: LayeredAvatarBackend = defaultBackend) {
  const [asset, setAsset] = useState<LayeredAvatarAsset>()
  const [selected, setSelected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    const controller = new AbortController()
    void (async () => {
      const saved = await store.load()
      if (!saved || controller.signal.aborted) return
      const rig = await backend.parse(saved.file, { signal: controller.signal })
      if (!controller.signal.aborted) { setAsset({ name: saved.name, file: saved.file, rig }); setSelected(saved.selected) }
    })().catch(e => { if (!controller.signal.aborted) setError(`角色恢复失败，已使用 3D：${e.message}`) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => { active.current = false; controller.abort() }
  }, [backend, store])
  const save = async (next: LayeredAvatarAsset, use: boolean): Promise<void> => {
    await store.save({ name: next.name, file: next.file, selected: use })
    if (active.current) { setAsset(next); setSelected(use); setError('') }
  }
  return { asset, selected, loading, error, backend,
    use: (next: LayeredAvatarAsset) => save(next, true),
    use3d: async () => { if (asset) await save(asset, false); else setSelected(false) },
    remove: async () => { await store.save(undefined); if (active.current) { setSelected(false); setAsset(undefined); setError('') } },
    failed: (message: string) => { setSelected(false); setError(`2.5D 显示失败，已回到 3D：${message}`) }
  }
}
