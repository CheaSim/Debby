// Only the byte-identical shipped v1 pack is eligible; imported or edited art stays untouched.
const legacyWhale = { bytes: 2_970_016, sha256: 'e00b90ae5e1f49b014f2f99ba18bc047add49574d6e216abc3eb67504f270c1c' }
export async function refreshBuiltinAvatar(file: Blob, load: () => Promise<Blob>, signal: AbortSignal): Promise<Blob> {
  if (file.size !== legacyWhale.bytes) return file
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
  signal.throwIfAborted()
  if (Array.from(digest, n => n.toString(16).padStart(2, '0')).join('') !== legacyWhale.sha256) return file
  try { const next = await load(); signal.throwIfAborted(); return next } catch { signal.throwIfAborted(); return file }
}
