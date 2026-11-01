/** Optional authoring only. An explicit endpoint uploads artwork; desktop playback stays offline. */
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises'
import { basename, extname, resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const maxFile = 64 * 1024 * 1024
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export async function* gradioEvents(body, signal) {
  const decoder = new TextDecoder(); let pending = ''
  const parse = block => ({ event: /^event: ?(.*)$/m.exec(block)?.[1] || 'message', data: block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n') })
  for await (const bytes of body) {
    signal?.throwIfAborted()
    pending += decoder.decode(bytes, { stream: true }).replace(/\r/g, '')
    if (pending.length > 1024 * 1024) throw Error('Gradio event exceeds 1 MB.')
    let end
    while ((end = pending.indexOf('\n\n')) >= 0) { const block = pending.slice(0, end); pending = pending.slice(end + 2); if (block.trim()) yield parse(block) }
  }
  pending += decoder.decode()
  if (pending.trim()) yield parse(pending)
}

async function boundedBytes(response, limit, signal) {
  if (Number(response.headers.get('content-length')) > limit) throw Error('Authoring output exceeds size limit.')
  const chunks = []; let length = 0
  for await (const chunk of response.body) { signal.throwIfAborted(); length += chunk.length; if (length > limit) throw Error('Authoring output exceeds size limit.'); chunks.push(chunk) }
  return Buffer.concat(chunks)
}

/** Injectable fetch, progress and cancellation; usable by an agent, CLI or asset pipeline. */
export async function decomposeHosted({ endpoint, image, filename = 'character.png', resolution = 768, seed = 42 }, { fetch: request = globalThis.fetch, signal: parent, onProgress = () => {} } = {}) {
  const host = new URL(endpoint)
  if (host.username || host.password || host.search || host.hash || (host.pathname !== '/' && host.pathname !== '') || !['https:', 'http:'].includes(host.protocol)) throw Error('Use a Gradio origin without credentials or query parameters.')
  if (host.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname)) throw Error('Remote authoring endpoints require HTTPS.')
  if (!image?.byteLength || image.byteLength > maxFile || !['.png', '.jpg', '.jpeg', '.webp'].includes(extname(filename).toLowerCase())) throw Error('Input must be a PNG/JPEG/WebP under 64 MB.')
  if (!Number.isInteger(resolution) || resolution < 768 || resolution > 1280 || resolution % 64) throw Error('resolution must be a multiple of 64 between 768 and 1280.')
  if (!Number.isInteger(seed) || seed < 0 || seed > 9999) throw Error('seed must be between 0 and 9999.')
  const signal = AbortSignal.any([...(parent ? [parent] : []), AbortSignal.timeout(15 * 60 * 1000)])
  signal.throwIfAborted()
  async function get(path, init = {}) {
    const r = await request(new URL(path, host), { ...init, signal, redirect: 'error' })
    if (!r.ok) {
      // Never print response bodies/headers: a private gateway may include credentials.
      throw Error(r.status === 401 || r.status === 403 ? `Authoring endpoint requires login (${r.status}). Use a signed-in demo or your own instance.` : `Authoring request failed (${r.status}).`)
    }
    return r
  }
  onProgress({ phase: 'checking' })
  const config = await (await get('/config')).json()
  if (config.api_prefix !== '/gradio_api' || !config.dependencies?.some(d => d.api_name === 'inference' && d.inputs?.length === 4)) throw Error('This is not a compatible See-through Gradio endpoint.')
  const form = new FormData(); form.append('files', new Blob([image]), basename(filename))
  onProgress({ phase: 'uploading' })
  const paths = await (await get('/gradio_api/upload', { method: 'POST', body: form })).json()
  if (!Array.isArray(paths) || typeof paths[0] !== 'string') throw Error('Invalid Gradio upload response.')
  const job = await (await get('/gradio_api/call/inference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [{ path: paths[0], orig_name: basename(filename), meta: { _type: 'gradio.FileData' } }, resolution, seed, true] }) })).json()
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(job.event_id)) throw Error('Invalid Gradio job id.')
  onProgress({ phase: 'queued', id: job.event_id })
  const stream = await get('/gradio_api/call/inference/' + job.event_id)
  let result
  for await (const event of gradioEvents(stream.body, signal)) {
    if (event.event === 'error') throw Error('See-through inference failed. Check endpoint GPU quota and server logs; no asset was produced.')
    if (event.event === 'complete') { result = JSON.parse(event.data); break }
    if (event.event !== 'heartbeat') onProgress({ phase: 'running' })
  }
  if (!Array.isArray(result) || !result[0]?.path || !Array.isArray(result[1]) || result[1].length > 64) throw Error('Missing or invalid layered output.')
  const files = [{ file: result[0], name: 'character.psd', role: 'psd' }, ...result[1].map((item, i) => ({ file: item.image, name: `${String(i).padStart(2, '0')}-${String(item.caption ?? 'layer').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)}.png`, role: String(item.caption ?? 'layer') }))]
  let total = 0
  const output = []
  for (const item of files) {
    signal.throwIfAborted()
    const url = new URL(item.file?.url || '/gradio_api/file=' + item.file?.path, host)
    if (url.origin !== host.origin || !url.pathname.startsWith('/gradio_api/file=')) throw Error('Unexpected authoring file URL.')
    onProgress({ phase: 'downloading', name: item.name })
    const bytes = await boundedBytes(await get(url), maxFile, signal)
    total += bytes.length
    if (total > 160 * 1024 * 1024) throw Error('Authoring outputs exceed total size limit.')
    if (item.role === 'psd' ? bytes.length < 26 || bytes.subarray(0, 6).toString('hex') !== '384250530001' || bytes.readUInt16BE(22) !== 8 || bytes.readUInt16BE(24) !== 3 : bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('Invalid RGB/8-bit PSD or PNG output.')
    output.push({ name: item.name, role: item.role, bytes, sha256: sha256(bytes) })
  }
  return { files: output, provenance: { endpoint: host.origin, gradio: config.version, job: job.event_id, created: new Date().toISOString(), input: { name: basename(filename), sha256: sha256(image) }, parameters: { resolution, seed, tblr_split: true }, outputs: output.map(({ name, role, sha256, bytes }) => ({ name, role, sha256, bytes: bytes.length })) } }
}

async function main() {
  const options = {}, args = process.argv.slice(2)
  for (let i = 0; i < args.length; i += 2) {
    if (!['--endpoint', '--input', '--output', '--resolution', '--seed'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('Usage: --endpoint URL --input image.png --output DIRECTORY [--resolution 768] [--seed 42]')
    options[args[i].slice(2)] = args[i + 1]
  }
  if (!options.endpoint || !options.input || !options.output) throw Error('Specify --endpoint, --input and --output. Artwork will be uploaded to that endpoint.')
  const controller = new AbortController(), abort = () => controller.abort()
  process.once('SIGINT', abort); process.once('SIGTERM', abort)
  try {
    console.log('Uploading artwork to the explicitly selected authoring endpoint. Cancelling stops this client; server jobs may continue.')
    const result = await decomposeHosted({ endpoint: options.endpoint, filename: options.input, image: await readFile(options.input), resolution: Number(options.resolution ?? 768), seed: Number(options.seed ?? 42) }, { signal: controller.signal, onProgress: info => console.log(JSON.stringify(info)) })
    await mkdir(resolve(options.output), { recursive: true })
    const directory = await mkdtemp(join(resolve(options.output), 'see-through-'))
    for (const file of result.files) await writeFile(join(directory, file.name), file.bytes)
    await writeFile(join(directory, 'provenance.json'), JSON.stringify(result.provenance, null, 2) + '\n')
    console.log(JSON.stringify({ directory, psd: join(directory, 'character.psd'), layers: result.files.length - 1 }))
  } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1 })
