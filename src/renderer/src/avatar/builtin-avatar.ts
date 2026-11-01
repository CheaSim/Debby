export const builtinWhalePath = 'models/whale-girl/debby-whale-girl-rigged.srig'
// Only byte-identical shipped packs are eligible; imported or edited art stays untouched.
const legacyWhales = [
  { bytes: 2_970_016, sha256: 'e00b90ae5e1f49b014f2f99ba18bc047add49574d6e216abc3eb67504f270c1c' },
  { bytes: 2_970_890, sha256: 'f896b2ef1a925917445044f1067dbbc832f721f63419c3b04efa04eb828f8783' }
]
export async function refreshBuiltinAvatar(file: Blob, load: () => Promise<Blob>, signal: AbortSignal): Promise<Blob> {
  const legacyWhale = legacyWhales.find(pack => pack.bytes === file.size)
  if (!legacyWhale) return file
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
  signal.throwIfAborted()
  if (Array.from(digest, n => n.toString(16).padStart(2, '0')).join('') !== legacyWhale.sha256) return file
  try { const next = await load(); signal.throwIfAborted(); return next } catch { signal.throwIfAborted(); return file }
}
