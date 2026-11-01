import { describe, expect, it, vi } from 'vitest'
import { decomposeHosted, gradioEvents } from '../integrations/see-through-hosted.mjs'

const options = { endpoint: 'https://authoring.example', filename: '鲸鱼娘.png', image: Buffer.from('image fixture') }
function fixture({ downloadOrigin = 'https://authoring.example', inferenceError = false, psdInvalid = false } = {}) {
  const header = Buffer.alloc(26); header.write('8BPS'); header.writeUInt16BE(1, 4); header.writeUInt16BE(8, 22); header.writeUInt16BE(3, 24)
  const response = (body, type = 'application/json') => new Response(typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), { headers: { 'content-type': type } })
  return vi.fn(async (url, init) => {
    const path = url.pathname
    if (path === '/config') return response({ version: '6.12.0', api_prefix: '/gradio_api', dependencies: [{ api_name: 'inference', inputs: [4, 5, 6, 7] }] })
    if (path === '/gradio_api/upload') { expect(init.body.get('files').name).toBe('鲸鱼娘.png'); return response(['/tmp/input.png']) }
    if (path === '/gradio_api/call/inference') { expect(JSON.parse(init.body).data.slice(1)).toEqual([768, 42, true]); return response({ event_id: 'job123' }) }
    if (path.endsWith('/job123')) return response(inferenceError ? 'event: error\ndata: null\n\n' : 'event: heartbeat\ndata: null\n\nevent: complete\ndata: ' + JSON.stringify([{ path: '/tmp/model.psd', url: downloadOrigin + '/gradio_api/file=/tmp/model.psd' }, [{ caption: '../../face', image: { path: '/tmp/face.png' } }]]) + '\n\n', 'text/event-stream')
    if (path.endsWith('model.psd')) return response(psdInvalid ? '<html>failed</html>' : header)
    if (path.endsWith('face.png')) return response(Buffer.from('89504e470d0a1a0a00000000', 'hex'))
    throw Error('Unexpected path ' + path)
  })
}
describe('hosted See-through authoring', () => {
  it('uploads only to an explicit endpoint, reads SSE and downloads validated files with provenance', async () => {
    const progress = [], result = await decomposeHosted(options, { fetch: fixture(), onProgress: e => progress.push(e.phase) })
    expect(result.files.map(f => f.name)).toEqual(['character.psd', '00-______face.png'])
    expect(result.provenance.input.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(result.provenance.parameters.tblr_split).toBe(true)
    expect(progress).toContain('queued'); expect(progress.filter(p => p === 'downloading')).toHaveLength(2)
  })
  it('rejects cross-origin result URLs and HTML masquerading as a PSD', async () => {
    await expect(decomposeHosted(options, { fetch: fixture({ downloadOrigin: 'https://other.example' }) })).rejects.toThrow('Unexpected authoring file URL')
    await expect(decomposeHosted(options, { fetch: fixture({ psdInvalid: true }) })).rejects.toThrow('Invalid RGB')
  })
  it('reports login and inference failures without exposing server response bodies', async () => {
    await expect(decomposeHosted(options, { fetch: async () => new Response('secret fixture', { status: 403 }) })).rejects.toThrow('requires login (403)')
    await expect(decomposeHosted(options, { fetch: fixture({ inferenceError: true }) })).rejects.toThrow('inference failed')
  })
  it('honors cancellation and rejects invalid configuration before upload', async () => {
    const controller = new AbortController(); controller.abort(); const fetch = fixture()
    await expect(decomposeHosted(options, { fetch, signal: controller.signal })).rejects.toHaveProperty('name', 'AbortError')
    await expect(decomposeHosted({ ...options, endpoint: 'http://remote.example' }, { fetch })).rejects.toThrow('HTTPS')
    await expect(decomposeHosted({ ...options, resolution: 123 }, { fetch })).rejects.toThrow('resolution')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('decodes split UTF-8 and CRLF events, including a final event without a blank terminator', async () => {
    const bytes = new TextEncoder().encode('event: complete\r\ndata: ["鲸鱼"]\r\n')
    const events = []; const body = (async function* () { for (const byte of bytes) yield Uint8Array.of(byte) })()
    for await (const event of gradioEvents(body)) events.push(event)
    expect(events).toEqual([{ event: 'complete', data: '["鲸鱼"]' }])
  })
})
