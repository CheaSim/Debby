import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { refreshBuiltinAvatar } from '../src/renderer/src/avatar/builtin-avatar'

function shippedV1(): Blob {
  const document = JSON.parse(readFileSync(new URL('../src/renderer/public/models/whale-girl/debby-whale-girl.srig', import.meta.url), 'utf8'))
  delete document.metadata.debby.motion
  document.metadata.notes = 'CC BY-NC-SA 4.0; see NOTICE.md. Portrait expressions only; no facial mesh, lip sync or skeletal dance.'
  return new Blob([JSON.stringify(document)])
}
describe('bundled portrait refresh', () => {
  it('recognizes the exact previous release and refreshes it without rewriting the user store', async () => {
    const file = shippedV1(), next = new Blob(['new bundled pack']), load = vi.fn(async () => next)
    expect(file.size).toBe(2_970_016)
    expect(await refreshBuiltinAvatar(file, load, new AbortController().signal)).toBe(next)
    expect(load).toHaveBeenCalledOnce()
  })
  it('preserves custom files, including edits with the same byte length', async () => {
    const bytes = new Uint8Array(await shippedV1().arrayBuffer()); bytes[0] ^= 1
    const custom = new Blob([bytes]), load = vi.fn(async () => new Blob())
    expect(await refreshBuiltinAvatar(custom, load, new AbortController().signal)).toBe(custom)
    expect(load).not.toHaveBeenCalled()
  })
  it('keeps the original pack available if the bundled replacement cannot load', async () => {
    const file = shippedV1()
    expect(await refreshBuiltinAvatar(file, async () => { throw Error('unavailable') }, new AbortController().signal)).toBe(file)
  })
})
