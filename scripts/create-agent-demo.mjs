// Real packaged-app footage and real MCP traffic; optional explicit local-BYOK narration.
// No microphone/camera capture. Local profiles and raw frames stay in ignored work/.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseEnv } from 'node:util'
import { execFileSync } from 'node:child_process'
import { _electron as electron } from 'playwright'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..'), work = join(root, 'work/agent-demo'), output = join(root, 'media/demo')
await mkdir(work, { recursive: true }); await mkdir(output, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'debby-agent-film-'))
const exe = join(root, 'dist/win-unpacked/Debby.exe')
const env = { ...process.env, FINPET_E2E_USER_DATA: profile, FINPET_E2E_BACKGROUND: '1', FINPET_MARKET_SOURCE: 'demo', ELECTRON_RENDERER_URL: '' }
delete env.ELECTRON_RUN_AS_NODE
const voice = process.argv.includes('--voice')
if (voice) for (const [name, value] of Object.entries(parseEnv(await readFile(join(root, '.env'), 'utf8')))) if (name.startsWith('DEBBY_QWEN_')) env[name] = value
const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { timeout: 240000, maxBuffer: 2_000_000 })
const probe = path => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path], { encoding: 'utf8' }))
let app, page, client, recording = false, cdp, start, stage = 'launch'
const frames = [], writes = [], events = [], errors = []
const now = () => (Date.now() - start) / 1000
const call = async (name, args = {}) => {
  const result = await client.callTool({ name: 'debby_' + name, arguments: args })
  assert.ok(!result.isError, JSON.stringify(result))
  if (recording) events.push({ at: now(), tool: name, arguments: args })
}
async function until(second) { const remaining = second * 1000 - (Date.now() - start); if (remaining > 0) await page.waitForTimeout(remaining) }
const narration = '给你的 Agent，找个可爱的搭档。忙的时候陪着你，需要你时提醒你。完成啦，一起开心一下。'
try {
  app = await electron.launch({ executablePath: exe, args: ['--mute-audio'], env })
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message))
  await page.waitForSelector('.layered-pet-host[data-layered-ready=true][data-view=full]', { timeout: 60000 })
  if (voice) {
    stage = 'gentle narration'
    assert.ok(env.DEBBY_QWEN_API_KEY, 'Configure local Qwen BYOK for --voice')
    await page.getByRole('button', { name: '快速对话', exact: true }).click()
    const sample = await page.evaluate(async text => {
      const { bytes } = await window.finpet.previewSpeech({ requestId: 'agent-film', text, speech: { style: 'gentle' }, cloudConsent: true })
      const context = new AudioContext()
      try {
        const decoded = await context.decodeAudioData(new Uint8Array(bytes).buffer)
        return { bytes: Array.from(bytes), duration: decoded.duration, peak: decoded.getChannelData(0).reduce((m, x) => Math.max(m, Math.abs(x)), 0) }
      } finally { await context.close() }
    }, narration)
    assert.ok(sample.peak > .001 && sample.duration < 14.8, 'Narration must be audible and fit the 15s edit')
    await writeFile(join(work, 'gentle-narration.mp3'), new Uint8Array(sample.bytes))
    await page.evaluate(() => window.finpet.togglePanel())
    console.log(`Gentle Qwen narration decoded: ${sample.duration.toFixed(2)}s, non-silent.`)
  }
  stage = 'real MCP connection'
  await page.evaluate(() => window.finpet.enableShell(true))
  client = new Client({ name: 'Demo Harness', version: '1.0.0' })
  await client.connect(new StdioClientTransport({ command: exe, args: [join(root, 'dist/win-unpacked/resources/mcp/debby-mcp.mjs'), '--connection', join(profile, 'agent-bridge.json'), '--name', 'Demo Harness'], env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, stderr: 'pipe' }))
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setResizable(true); w.setSize(540, 840) })
  // Only the recording backdrop and scale/placement change. Pet/UI/tool behavior is untouched.
  await page.addStyleTag({ content: `body { background: radial-gradient(ellipse at 50% 58%,#e4effb 0%,#f7f8fc 65%) !important; }
    .app-compact .mascot-stage { width:540px; height:800px; left:0; bottom:0; }
    .app-compact .speech { top:16px; left:52px; width:436px; padding:20px 22px; border-radius:18px; }
    .app-compact .speech strong {font-size:23px;margin-top:10px;}
    .app-compact .speech p {font-size:15px;margin-top:9px;}
    .app-compact .speech-kicker {font-size:12px;}
    .app-compact .pet-wrap {top:165px;bottom:90px;left:24px;right:24px;}
    .app-compact .pet-tools {bottom:30px;}
    .quick-chat-hint {display:none;}` })
  await call('set_task', { taskId: 'film', title: '正在帮你整理项目', status: 'working', progress: .2 })
  await call('say', { taskId: 'film', turnId: 'work', text: '[[emotion:curious|0.8]]交给我，你先忙自己的事吧。' })
  await page.waitForSelector('.layered-pet-host[data-emotion=curious]')
  await page.waitForTimeout(700)
  stage = 'capture'
  const frameDir = await mkdtemp(join(work, 'frames-'))
  start = Date.now(); recording = true
  cdp = await page.context().newCDPSession(page)
  cdp.on('Page.screencastFrame', frame => {
    if (!recording) return
    const file = join(frameDir, `${String(frames.length).padStart(5, '0')}.png`)
    frames.push({ file, at: now() }); writes.push(writeFile(file, Buffer.from(frame.data, 'base64')))
    void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 1080, maxHeight: 1680, everyNthFrame: 1 })
  events.push({ at: 0, state: 'working', source: 'real MCP set_task + say before recording' })
  await until(4)
  await call('set_task', { taskId: 'film', title: '有个决定，想听听你的', status: 'waiting', progress: .65 })
  await call('say', { taskId: 'film', turnId: 'wait', text: '[[emotion:caring|0.8]]需要你啦，我在这里等你。' })
  await call('animate', { taskId: 'film', name: 'notify' })
  await until(8)
  await call('set_task', { taskId: 'film', title: '完成啦！来看看吧', status: 'completed', progress: 1 })
  await call('say', { taskId: 'film', turnId: 'done', text: '[[emotion:happy|0.9]]今天也一起向前了一小步。' })
  await call('animate', { taskId: 'film', name: 'celebrate' })
  await page.waitForTimeout(900)
  await page.screenshot({ path: join(work, 'cover.png') })
  await until(12)
  await call('say', { taskId: 'film', turnId: 'bye', text: '[[emotion:shy|0.75]]我是 Debby，明天也一起加油呀。' })
  await until(15.2)
  recording = false
  await cdp.send('Page.stopScreencast'); await Promise.all(writes)
  assert.ok(frames.length > 150, `Need fluid footage, received ${frames.length} frames`)
  assert.deepEqual(errors, [])
  await call('release'); await client.close(); client = undefined
  await app.close(); app = undefined
  stage = 'render'
  const listing = frames.map((frame, i) => `file '${frame.file.replaceAll('\\', '/')}'\nduration ${Math.max(.001, (frames[i + 1]?.at ?? 15.2) - frame.at).toFixed(4)}`).join('\n')
  await writeFile(join(work, 'frames.ffconcat'), `ffconcat version 1.0\n${listing}\nfile '${frames.at(-1).file.replaceAll('\\', '/')}'\n`)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><g font-family="Microsoft YaHei,Segoe UI,sans-serif"><rect width="1080" height="190" fill="#f7f8fc"/><text x="68" y="65" font-size="24" fill="#8392b8" letter-spacing="5">DEBBY / YOUR AGENT COMPANION</text><text x="68" y="146" font-size="55" font-weight="700" fill="#343f61">给 Agent，一个可爱的身体。</text><rect y="1735" width="1080" height="185" fill="#f7f8fc"/><text x="540" y="1793" text-anchor="middle" font-size="30" fill="#6576a0">工作陪着你 · 需要你时提醒 · 完成一起庆祝</text><text x="540" y="1844" text-anchor="middle" font-size="29" font-weight="600" fill="#465a87">github.com/CheaSim/Debby</text><text x="540" y="1890" text-anchor="middle" font-size="18" fill="#8b93a8">真实应用与 MCP 录制 · 演示任务 / 行情 · 非商用预览${voice ? ' · 阿里云温柔 TTS 旁白' : ''}</text></g></svg>`
  await sharp(Buffer.from(svg)).png().toFile(join(work, 'overlay.png'))
  const video = join(output, 'debby-agent-15s.mp4')
  const audio = voice ? ['-i', join(work, 'gentle-narration.mp3')] : []
  ff(['-f', 'concat', '-safe', '0', '-i', join(work, 'frames.ffconcat'), '-loop', '1', '-i', join(work, 'overlay.png'), ...audio,
    '-filter_complex', '[0:v]scale=1000:1556,setsar=1,fps=30,pad=1080:1920:40:185:color=0xf7f8fc[base];[base][1:v]overlay=0:0,format=yuv420p[v]',
    '-map', '[v]', ...(voice ? ['-map', '2:a', '-af', 'apad,loudnorm=I=-16:TP=-1.5:LRA=9', '-c:a', 'aac', '-b:a', '192k'] : ['-an']),
    '-t', '15', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-movflags', '+faststart', '-y', video])
  ff(['-ss', '9', '-i', video, '-frames:v', '1', '-y', join(output, 'debby-agent-cover.png')])
  ff(['-ss', '7.7', '-t', '4', '-i', video, '-filter_complex', 'fps=12,scale=320:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse', '-y', join(output, 'debby-agent-preview.gif')])
  const info = probe(video), stream = info.streams.find(s => s.codec_type === 'video')
  assert.equal(stream.width, 1080); assert.equal(stream.height, 1920); assert.equal(Number(info.format.duration), 15)
  await writeFile(join(output, 'agent-validation.json'), JSON.stringify({ durationSeconds: Number(info.format.duration), width: stream.width, height: stream.height, fps: stream.r_frame_rate, capturedFrames: frames.length, realMcp: true, packagedApp: true, voice: voice ? { provider: 'Qwen TTS', style: 'gentle', role: 'narration, not an Agent-generated reply', text: narration } : null, artwork: 'CC BY-NC-SA 4.0, see whale-girl/NOTICE.md', simulatedTaskAndQuotes: true, pageErrors: errors, events }, null, 2))
  console.log(`Demo verified: 15.000s, 1080×1920, real packaged app/MCP, ${frames.length} captured frames.`)
} catch (error) {
  console.error(`Agent demo failed at ${stage}: ${stage === 'gentle narration' ? 'Qwen narration unavailable; no provider credentials or raw response logged.' : error.message}`)
  await page?.screenshot({ path: join(work, 'failure.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  recording = false
  await client?.close().catch(() => {}); await app?.close().catch(() => {})
  await rm(profile, { recursive: true, force: true })
}
