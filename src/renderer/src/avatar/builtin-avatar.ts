export const builtinWhalePath = 'models/whale-girl/debby-whale-girl.debby'
// Only byte-identical shipped packs are eligible; imported or edited art stays untouched.
const legacyWhales = [
  { bytes: 2_970_016, sha256: 'e00b90ae5e1f49b014f2f99ba18bc047add49574d6e216abc3eb67504f270c1c' },
  { bytes: 2_970_890, sha256: 'f896b2ef1a925917445044f1067dbbc832f721f63419c3b04efa04eb828f8783' },
  { bytes: 3_996_529, sha256: 'd85f81c13f4409e365fc1dde93374ce1535704881515405b542af59ffc0ccb41' },
  { bytes: 3_166_697, sha256: '2c0fe63b725b7f4a2164bf82a7e2cd8c9e0ebde48520b6b9e170a97b1203c308' },
  { bytes: 16_319_328, sha256: '67fc7cd76e5279ad81e12885e68721b1c72ab7a7ea294b9baec8f25363b0131a' },
  { bytes: 32_421_008, sha256: '0e293bb65fd84746681b1af0283f5e891e024517f1d6e4e3ec2ad953e08a07b6' }
]
export async function refreshBuiltinAvatar(file: Blob, load: () => Promise<Blob>, signal: AbortSignal): Promise<Blob> {
  const legacyWhale = legacyWhales.find(pack => pack.bytes === file.size)
  if (!legacyWhale) return file
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))
  signal.throwIfAborted()
  if (Array.from(digest, n => n.toString(16).padStart(2, '0')).join('') !== legacyWhale.sha256) return file
  try { const next = await load(); signal.throwIfAborted(); return next } catch { signal.throwIfAborted(); return file }
}
