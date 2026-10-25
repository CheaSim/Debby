// Opt-in production recording. Requires the owner's ignored local Qwen BYOK.
// Raw takes and narration stay in work/; no credentials or camera/mic data are captured.
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { tmpdir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { _electron as electron } from 'playwright'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const work = resolve(root, 'work/community-demo')
await mkdir(work, { recursive: true })
const require = createRequire(import.meta.url)
const local = parseEnv(await readFile(resolve(root, '.env'), 'utf8'))
const env = { ...process.env }
for (const [name, value] of Object.entries(local)) if (name.startsWith('DEBBY_QWEN_')) env[name] ??= value
assert.ok(env.DEBBY_QWEN_API_KEY, 'Local Qwen BYOK is required')
const userData = await mkdtemp(join(tmpdir(), 'debby-film-'))
const captions = [
  '我给电脑，养了个小可爱。',
  '摸摸头，她还会偷偷冒出爱心。',
  '涨了替你开心，跌了陪你稳住。',
  '不知道聊什么？点一句，就能开始。',
  '你打字，她边回边说。',
  '还能让你的 Agent，有个可爱的身体。',
  '她叫 Debby。你想让她先学会什么？'
]
const manifest = { width: 1080, height: 1680, narration: [], scenes: [], realVoice: null }
let app, agent, page, stage = 'launch'
let clock
let cdp, firstFrame, recording = false
const frames = [], writes = []
const stamp = () => (Date.now() - clock) / 1000
async function shot(name, action) {
  const start = stamp()
  await action()
  manifest.scenes.push({ name, start, duration: stamp() - start })
  await page.screenshot({ path: join(work, `${name}.png`) })
  console.log(`Recorded ${name}`)
}
async function compact() {
  if (await page.locator('.app-expanded').count()) await page.evaluate(() => window.finpet.togglePanel())
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setResizable(true); w.setBounds({ x: 10, y: 10, width: 540, height: 840 }) })
  await page.waitForFunction(() => innerWidth === 540 && innerHeight === 840)
  await page.waitForTimeout(500)
}
async function market(pct) {
  await app.evaluate(({ BrowserWindow }, pct) => {
    clearInterval(globalThis.filmQuotes)
    const send = () => BrowserWindow.getAllWindows()[0].webContents.send('market:quotes', [
      { symbol: '000001.SH', name: '上证指数', previousClose: 3200, price: 3200 * (1 + pct / 100), change: 32 * pct, changePct: pct, timestamp: Date.now(), status: 'open', sparkline: [3200, 3205, 3210] }
    ])
    send(); globalThis.filmQuotes = setInterval(send, 100)
  }, pct)
}
try {
  app = await electron.launch({ executablePath: require('electron'), args: ['.', '--mute-audio'], cwd: root,
    env: { ...env, ELECTRON_RENDERER_URL: '', FINPET_E2E_USER_DATA: userData, FINPET_MARKET_SOURCE: 'demo' } })
  page = await app.firstWindow()
  clock = Date.now()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForSelector('[data-3d-ready="true"]', { timeout: 45000 })
  // Only the recording backdrop and placement change. All interactions/rendering are the product.
  await page.addStyleTag({ content: `body { background: #fbf7fa !important; }
    .app-compact .mascot-stage { left: 80px; bottom: 125px; }
    .app-expanded { border-radius: 0; box-shadow: none; }
    .app-dialogue .dashboard-shell { grid-template-columns: 128px minmax(0,1fr); }
    .app-dialogue .mascot-stage { left: 128px; }
    .app-dialogue .pet-tools { left: 64px; }` })
  await page.getByRole('button', { name: '快速对话', exact: true }).click()
  stage = 'narration'
  for (let i = 0; i < captions.length; i++) {
    const audio = await page.evaluate(async ({ text, i }) => {
      const { bytes } = await window.finpet.readAloud({ requestId: `film-narration-${i}`, text, cloudConsent: true })
      const context = new AudioContext()
      try {
        const decoded = await context.decodeAudioData(new Uint8Array(bytes).buffer)
        return { bytes: Array.from(bytes), duration: decoded.duration, peak: decoded.getChannelData(0).reduce((m, x) => Math.max(m, Math.abs(x)), 0) }
      } finally { await context.close() }
    }, { text: captions[i], i })
    assert.ok(audio.peak > .001 && audio.duration > .4)
    const file = `voice-${i}.mp3`
    await writeFile(join(work, file), new Uint8Array(audio.bytes))
    manifest.narration.push({ text: captions[i], file, duration: audio.duration })
    console.log(`Validated narration ${i + 1}/${captions.length}: ${audio.duration.toFixed(2)}s`)
  }
  stage = 'compact takes'
  await compact(); await market(.84)
  // Lossless PNG screencast avoids the 1 Mbit/s test-video recorder blurring hair and UI.
  const framesDir = await mkdtemp(join(work, 'frames-'))
  cdp = await page.context().newCDPSession(page)
  recording = true
  cdp.on('Page.screencastFrame', frame => {
    if (!recording) return
    const at = stamp()
    firstFrame ??= at
    const file = join(framesDir, `${String(frames.length).padStart(5, '0')}.png`)
    frames.push({ file, at })
    writes.push(writeFile(file, Buffer.from(frame.data, 'base64')))
    void cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 1080, maxHeight: 1680, everyNthFrame: 1 })
  while (!frames.length) await page.waitForTimeout(50)
  await shot('intro', async () => {
    await page.waitForTimeout(1500)
    await page.locator('.three-pet-host').click({ position: { x: 160, y: 80 } })
    await page.waitForTimeout(2800)
  })
  await shot('pat', async () => {
    await page.locator('.three-pet-host').click({ position: { x: 168, y: 85 } })
    await page.waitForTimeout(3400)
  })
  await shot('market', async () => {
    await market(.84); await page.waitForTimeout(2600)
    await market(-1.28); await page.waitForTimeout(3500)
  })
  stage = 'guided conversation'
  await shot('entry', async () => {
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: '快速对话', exact: true }).click()
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setResizable(true); w.setSize(540, 840) })
    await page.waitForTimeout(1800)
  })
  await shot('guidance', async () => {
    await page.getByRole('button', { name: '今天有点累', exact: true }).click()
    const consent = page.getByRole('dialog', { name: '陪你聊聊', exact: true })
    await consent.waitFor()
    await consent.getByRole('checkbox').first().check()
    await page.waitForTimeout(600)
    await consent.getByRole('button', { name: '开始陪伴' }).click()
    await consent.waitFor({ state: 'detached' })
    assert.match(await page.getByRole('textbox', { name: '对 Debby 说' }).inputValue(), /有点累/)
    await page.waitForTimeout(1600)
  })
  // Capture actual streamed audio and its offset relative to the video, without device capture.
  await page.evaluate(() => {
    window.filmAudio = []
    window.finpet.onVoiceAudio(packet => window.filmAudio.push({ ...packet, bytes: Array.from(packet.bytes), at: Date.now() }))
  })
  stage = 'real model turn'
  await shot('conversation', async () => {
    await page.getByRole('textbox', { name: '对 Debby 说' }).fill('今天有点累，用一句不超过二十个字的中文安慰我。')
    manifest.sentAt = stamp()
    await page.locator('[title="发送消息"]').click()
    await page.waitForFunction(async () => (await window.finpet.getVoiceState()).chat.messages.some(m => m.role === 'assistant' && m.status === 'done'), undefined, { timeout: 90000 })
    await page.waitForFunction(() => window.filmAudio.some(a => a.bytes.length > 0), undefined, { timeout: 45000 })
    await page.waitForFunction(() => Number(document.querySelector('.three-pet-host').dataset.mouth) > .01, undefined, { timeout: 15000 })
    await page.waitForTimeout(6500)
  })
  const response = await page.evaluate(async () => ({ state: await window.finpet.getVoiceState(), audio: window.filmAudio }))
  assert.equal(response.state.chat.error, undefined)
  const packets = response.audio.filter(p => p.bytes.length)
  assert.ok(packets.length && packets.every(p => p.format === 'pcm16'), 'Live stream must be PCM for synchronized edit')
  await writeFile(join(work, 'reply.pcm'), Buffer.concat(packets.map(p => Buffer.from(p.bytes))))
  manifest.realVoice = { text: response.state.chat.messages.filter(m => m.role === 'assistant').at(-1).text,
    firstAudioAt: (packets[0].at - clock) / 1000, sampleRate: packets[0].sampleRate, packets: packets.length, file: 'reply.pcm' }
  await page.screenshot({ path: join(work, 'conversation-done.png') })
  await shot('followup', async () => { await page.waitForTimeout(2200) })
  await page.evaluate(() => window.finpet.stopVoice())
  stage = 'MCP take'
  await compact()
  await page.locator('[title="桌宠选项"]').click()
  await page.locator('#pet-options [title="Agent 接入"]').click()
  await page.getByRole('checkbox', { name: '允许本机 Agent 接入' }).check()
  agent = new Client({ name: 'Demo Harness', version: '1.0.0' })
  await agent.connect(new StdioClientTransport({ command: process.execPath, args: [join(root, 'scripts/debby-mcp.mjs'), '--connection', join(userData, 'agent-bridge.json'), '--name', 'Demo Harness'], cwd: root, stderr: 'pipe' }))
  await page.locator('[title="关闭 Agent 接入"]').click()
  const call = async (name, args) => { const result = await agent.callTool({ name: `debby_${name}`, arguments: args }); assert.ok(!result.isError) }
  await shot('agent', async () => {
    await call('set_task', { taskId: 'film', title: '正在检查你的项目', status: 'working', progress: .35 })
    await call('say', { taskId: 'film', turnId: 'work', text: '我在认真检查，马上就好啦。' })
    await page.waitForTimeout(2200)
    await call('set_task', { taskId: 'film', title: '做好啦，来看看吧', status: 'completed', progress: 1 })
    await call('say', { taskId: 'film', turnId: 'done', text: '今天也一起向前了一小步。' })
    await call('animate', { taskId: 'film', name: 'celebrate' })
    await page.waitForTimeout(3000)
  })
  await call('release', {})
  await shot('outro', async () => { await market(.84); await page.waitForTimeout(4500) })
  assert.deepEqual(errors, [])
  manifest.video = 'raw.mp4'
  manifest.clockAtClose = stamp()
  manifest.firstFrameAt = firstFrame
  recording = false
  await cdp.send('Page.stopScreencast')
  await Promise.all(writes)
  manifest.captureNote = 'Actual Electron app, controlled demo quotes, real local Qwen BYOK conversation/TTS, actual MCP client. No camera or microphone used.'
  await app.close(); app = undefined
  const listing = frames.map((frame, index) => `file '${frame.file.replaceAll('\\', '/')}'\nduration ${Math.max(.001, (frames[index + 1]?.at ?? manifest.clockAtClose) - frame.at).toFixed(4)}`).join('\n')
  await writeFile(join(work, 'frames.ffconcat'), `ffconcat version 1.0\n${listing}\nfile '${frames.at(-1).file.replaceAll('\\', '/')}'\n`)
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(work, 'frames.ffconcat'), '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p', '-an', '-y', join(work, 'raw.mp4')], { timeout: 180000 })
  await writeFile(join(work, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('Recording and real Qwen speech verified. Safe manifest saved to work/community-demo/manifest.json')
} catch (error) {
  console.error(`Demo recording failed at: ${stage}. No raw provider response logged.`)
  if (stage === 'launch') console.error(String(error.message).slice(0, 1800))
  if (page) await page.screenshot({ path: join(work, 'failure.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  await agent?.close().catch(() => {})
  await app?.close().catch(() => {})
  await rm(userData, { recursive: true, force: true })
}
