export interface SavedLayeredAvatar { name: string; file: Blob; selected: boolean }
/** Host apps may inject a filesystem/cloud store without changing the renderer. */
export interface LayeredAvatarStore { load(): Promise<SavedLayeredAvatar | undefined>; save(asset: SavedLayeredAvatar | undefined): Promise<void> }
export class IndexedDbAvatarStore implements LayeredAvatarStore {
  private async transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('debby-avatar', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('models')
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error)
    })
    try { return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('models', mode), request = operation(tx.objectStore('models'))
      tx.oncomplete = () => resolve(request.result); tx.onerror = tx.onabort = () => reject(tx.error ?? Error('角色保存失败。'))
    }) } finally { db.close() }
  }
  load(): Promise<SavedLayeredAvatar | undefined> { return this.transaction('readonly', s => s.get('current')) }
  async save(asset: SavedLayeredAvatar | undefined): Promise<void> {
    if (asset) await this.transaction('readwrite', s => s.put(asset, 'current'))
    else await this.transaction('readwrite', s => s.delete('current'))
  }
}
