// Reproducible vertical edit from real app footage captured by capture-community-demo.mjs.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const work = join(root, 'work/community-demo')
const output = join(root, 'media/demo')
await mkdir(output, { recursive: true })
const manifest = JSON.parse(await readFile(join(work, 'manifest.json'), 'utf8'))
const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { timeout: 240000, maxBuffer: 2_000_000 })
const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { encoding: 'utf8' }))
const raw = join(work, manifest.video)
const offset = manifest.firstFrameAt === undefined ? Number(probe(raw).format.duration) - manifest.clockAtClose : -manifest.firstFrameAt
const scene = name => manifest.scenes.find(s => s.name === name)
const esc = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const font = 'Microsoft YaHei,Microsoft YaHei UI,Segoe UI,sans-serif'
const svg = (content, h = 1920) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${h}" viewBox="0 0 1080 ${h}"><g font-family="${font}">${content}</g></svg>`)
const text = (x, y, size, value, color = '#302833', weight = 500, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" ${extra}>${esc(value)}</text>`
const center = (y, size, value, color, weight) => text(540, y, size, value, color, weight, 'text-anchor="middle"')
const edits = [
  { take: 'intro', length: 3.2, title: ['电脑里，住进了', '一个小可爱。'], sub: '认识一下，你的桌面伙伴', voice: 0 },
  { take: 'pat', length: 3.6, title: ['轻轻摸一下', '她会认真回应。'], sub: '摸头 · 爱心眼 · 歪头', voice: 1 },
  { take: 'market', length: 6.1, title: ['行情有起伏', '陪伴一直在。'], sub: '指数涨跌 → 角色心情', voice: 2 },
  { take: 'entry', length: 2.65, title: ['不知道聊什么？'], sub: '从桌面「对话」开始', voice: 3, chat: true },
  { take: 'guidance', length: 2.4, title: ['点一句，就能开始。'], sub: '首次连接 BYOK · 问题会保留', chat: true },
  { take: 'guidance', length: 2.9, hold: true, title: ['你打字，她边回边说。'], sub: '通义对话 + 阿里云流式语音', voice: 4, chat: true },
  { take: 'conversation', length: scene('conversation').duration, title: ['「今天有点累。」'], sub: '以下为真实模型回复与语音', chat: true, reply: true },
  { take: 'followup', length: 1.2, title: ['聊完这一句', '还有下一句。'], sub: '回答后，给你自然的接话选项', chat: true },
  { take: 'agent', length: 5.28, title: ['让你的 Agent', '有个可爱的身体。'], sub: '任务进度 · 完成庆祝 · MCP 接入', voice: 5 },
  { take: 'outro', length: 4.5, title: ['她叫 Debby。'], sub: '你想让她先学会什么？', voice: 6, end: true }
]
const subtitles = []
const audioClips = []
let timeline = 0
for (let i = 0; i < edits.length; i++) {
  const edit = edits[i], take = scene(edit.take)
  edit.at = timeline
  // Use an exact 30 fps frame count, so concatenated scenes cannot drift against speech.
  edit.length = Math.round(edit.length * 30) / 30
  const over = []
  over.push(`<rect width="1080" height="350" fill="#fbf7fa"/>`)
  over.push(text(82, 120, 28, 'DEBBY / 桌面陪伴日记', '#af7894', 600))
  over.push(text(970, 120, 22, `${String(i + 1).padStart(2, '0')} / 10`, '#b3a7b0', 500, 'text-anchor="end"'))
  edit.title.forEach((line, n) => over.push(text(80, 230 + n * 88, 70, line, '#362e39', 700)))
  over.push(text(82, edit.title.length === 1 ? 295 : 380, 29, edit.sub, '#a46786', 500))
  const caption = edit.voice !== undefined ? manifest.narration[edit.voice].text : edit.reply ? '' : edit.take === 'guidance' ? '首次需自己的 Key，配置后从刚才的问题继续。' : edit.take === 'followup' ? '点一个话题，我们接着聊。' : ''
  over.push(`<rect x="0" y="1748" width="1080" height="172" fill="#fbf7fa"/>`)
  if (caption) {
    const lines = caption.length > 23 ? [caption.slice(0, 18), caption.slice(18)] : [caption]
    lines.forEach((line, n) => over.push(center(1782 + n * 47, 35, line, '#594650', 500)))
  }
  over.push(text(82, 1880, 20, edit.end ? '角色 Zome · Yorshka / Shiny · Mate-Engine' : '实际产品录制 · 演示行情，非实盘', '#a49aa2'))
  over.push(`<rect x="80" y="1910" width="900" height="3" rx="1.5" fill="#eadce5"/><rect x="80" y="1910" width="${900 * (i + 1) / edits.length}" height="3" rx="1.5" fill="#c283a1"/>`)
  if (edit.end) {
    over.push(`<rect x="80" y="1585" width="900" height="115" rx="24" fill="#fff" stroke="#ebdae4"/>`)
    over.push(center(1637, 32, 'github.com/CheaSim/Debby', '#b25f86', 600))
    over.push(center(1676, 22, '个人非商用预览 · Windows · BYOK', '#9c8d98', 500))
  }
  // A large, synchronized subtitle makes the actual reply legible on a phone.
  if (edit.reply) {
    const reply = manifest.realVoice.text
    const split = reply.indexOf('，') + 1 || Math.ceil(reply.length / 2)
    over.push(center(1790, 37, reply.slice(0, split), '#984d73', 600))
    over.push(center(1840, 37, reply.slice(split), '#984d73', 600))
  }
  const overlay = join(work, `overlay-${i}.png`)
  await sharp(svg(over.join(''))).png().toFile(overlay)
  const target = join(work, `scene-${i}.mp4`)
  const seek = Math.max(0, take.start + offset + (edit.hold ? Math.max(0, take.duration - .2) : 0))
  const input = edit.hold ? ['-loop', '1', '-i', join(work, 'guidance.png')] : ['-ss', String(seek), '-i', raw]
  const treatment = edit.chat ? 'scale=900:1400' : 'crop=860:1100:110:350,scale=900:1152'
  const y = edit.chat ? 350 : 470
  const filter = `[0:v]${treatment},setsar=1,fps=30,trim=duration=${edit.length},setpts=PTS-STARTPTS[clip];color=c=0xfbf7fa:s=1080x1920:r=30:d=${edit.length}[bg];[bg][clip]overlay=90:${y}:shortest=1[base];[base][1:v]overlay=0:0:shortest=1,format=yuv420p[v]`
  ff([...input, '-loop', '1', '-i', overlay, '-filter_complex', filter, '-map', '[v]', '-t', String(edit.length), '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-an', '-y', target])
  if (edit.voice !== undefined) {
    const info = manifest.narration[edit.voice]
    const duration = Number(probe(join(work, info.file)).format.duration)
    audioClips.push({ file: join(work, info.file), at: timeline + .25 })
    subtitles.push({ at: timeline + .25, end: timeline + .25 + duration, text: info.text })
  }
  if (edit.reply) {
    const at = timeline + manifest.realVoice.firstAudioAt - take.start
    const wav = join(work, 'reply.wav')
    ff(['-f', 's16le', '-ar', String(manifest.realVoice.sampleRate), '-ac', '1', '-i', join(work, manifest.realVoice.file), '-c:a', 'pcm_s16le', '-y', wav])
    audioClips.push({ file: wav, at })
    subtitles.push({ at, end: at + Number(probe(wav).format.duration), text: manifest.realVoice.text })
  }
  timeline += edit.length
  console.log(`Rendered scene ${i + 1}/${edits.length}`)
}
const listing = edits.map((_, i) => `file '${join(work, `scene-${i}.mp4`).replaceAll('\\', '/')}'`).join('\n')
await writeFile(join(work, 'edit.ffconcat'), listing)
ff(['-f', 'concat', '-safe', '0', '-i', join(work, 'edit.ffconcat'), '-c', 'copy', '-y', join(work, 'picture.mp4')])

// Original synthesized music bed: slow major-seventh pad + sparse bell notes. No samples.
const rate = 48000, samples = Math.ceil(timeline * rate), bed = Buffer.alloc(44 + samples * 2)
bed.write('RIFF', 0); bed.writeUInt32LE(bed.length - 8, 4); bed.write('WAVEfmt ', 8); bed.writeUInt32LE(16, 16)
bed.writeUInt16LE(1, 20); bed.writeUInt16LE(1, 22); bed.writeUInt32LE(rate, 24); bed.writeUInt32LE(rate * 2, 28)
bed.writeUInt16LE(2, 32); bed.writeUInt16LE(16, 34); bed.write('data', 36); bed.writeUInt32LE(samples * 2, 40)
const chords = [[261.63, 329.63, 392, 493.88], [220, 261.63, 329.63, 392], [174.61, 220, 261.63, 329.63], [196, 246.94, 293.66, 392]]
const bells = [783.99, 987.77, 1174.66, 987.77, 659.25, 783.99, 987.77, 1318.51]
for (let i = 0; i < samples; i++) {
  const t = i / rate, pos = t % 4, envelope = Math.min(1, pos / .8, (4 - pos) / .8)
  const chord = chords[Math.floor(t / 4) % chords.length]
  let value = chord.reduce((sum, hz) => sum + Math.sin(2 * Math.PI * hz * t) * .003, 0) * envelope
  const bell = t % 1.6
  value += Math.sin(2 * Math.PI * bells[Math.floor(t / 1.6) % bells.length] * t) * Math.exp(-bell * 4) * .008
  value *= Math.min(1, t / 1.5, (timeline - t) / 2)
  bed.writeInt16LE(Math.round(value * 32767), 44 + i * 2)
}
await writeFile(join(work, 'original-bed.wav'), bed)
const audioInputs = audioClips.flatMap(clip => ['-i', clip.file])
const filters = audioClips.map((clip, i) => `[${i + 2}:a]aresample=48000,volume=1.1,adelay=${Math.round(clip.at * 1000)}:all=1[a${i}]`)
filters.push(`[1:a]volume=.8[bed]`)
filters.push(`[bed]${audioClips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${audioClips.length + 1}:normalize=0,alimiter=limit=.95,loudnorm=I=-16:TP=-1.5:LRA=9[audio]`)
const video = join(output, 'debby-companion-vertical.mp4')
ff(['-i', join(work, 'picture.mp4'), '-i', join(work, 'original-bed.wav'), ...audioInputs, '-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[audio]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(timeline), '-movflags', '+faststart', '-y', video])
const timecode = s => { const ms = Math.round(s * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}` }
await writeFile(join(output, 'debby-companion-vertical.srt'), subtitles.map((s, i) => `${i + 1}\n${timecode(s.at)} --> ${timecode(s.end)}\n${s.text}\n`).join('\n'))

// Cover uses the actual captured character, not concept art.
const { data: heroPixels, info: heroInfo } = await sharp(join(work, 'intro.png')).extract({ left: 245, top: 620, width: 610, height: 675 }).resize(720, 796).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
// Remove only the flat outer backdrop; the model's pale clothing keeps its opacity.
const visited = new Uint8Array(heroInfo.width * heroInfo.height), queue = []
const push = (x, y) => { const p = y * heroInfo.width + x; if (!visited[p]) { visited[p] = 1; queue.push(p) } }
for (let x = 0; x < heroInfo.width; x++) { push(x, 0); push(x, heroInfo.height - 1) }
for (let y = 0; y < heroInfo.height; y++) { push(0, y); push(heroInfo.width - 1, y) }
for (let at = 0; at < queue.length; at++) {
  const p = queue[at], n = p * 4
  if (Math.max(Math.abs(heroPixels[n] - 251), Math.abs(heroPixels[n + 1] - 247), Math.abs(heroPixels[n + 2] - 250)) > 19) continue
  heroPixels[n + 3] = 0
  const x = p % heroInfo.width, y = Math.floor(p / heroInfo.width)
  if (x > 0) push(x - 1, y)
  if (x < heroInfo.width - 1) push(x + 1, y)
  if (y > 0) push(x, y - 1)
  if (y < heroInfo.height - 1) push(x, y + 1)
}
const hero = await sharp(heroPixels, { raw: heroInfo }).png().toBuffer()
const cover = svg(`<rect width="1080" height="1440" fill="#fbf7fa"/><circle cx="900" cy="720" r="360" fill="#f5e9f0"/><circle cx="145" cy="1000" r="160" fill="#f6edf2"/>${text(80, 115, 30, 'DEBBY / 我的桌面新室友', '#b57896', 600)}${text(80, 245, 92, '养在电脑里的', '#342b37', 700)}${text(80, 365, 104, '小 可 爱', '#ad6288', 700)}${text(80, 444, 32, '会回应，也会陪你聊两句。', '#998591', 500)}${center(1320, 35, '3D 桌宠 · 中文语音 · Agent 接入', '#a36282', 600)}${center(1385, 23, '实际产品画面 / 个人非商用预览', '#ac9da8', 500)}`, 1440)
await sharp(cover).composite([{ input: hero, left: 190, top: 480 }]).png().toFile(join(output, 'debby-cover-3x4.png'))
ff(['-ss', '1.4', '-i', video, '-frames:v', '1', '-y', join(output, 'debby-cover-9x16.png')])
ff(['-i', video, '-t', '6.8', '-filter_complex', 'fps=15,scale=360:640:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', '-y', join(output, 'debby-preview.gif')])
const info = probe(video)
const videoStream = info.streams.find(s => s.codec_type === 'video'), audioStream = info.streams.find(s => s.codec_type === 'audio')
if (videoStream.width !== 1080 || videoStream.height !== 1920 || !audioStream || Math.abs(Number(info.format.duration) - timeline) > .15) throw Error('Final media validation failed')
await writeFile(join(output, 'validation.json'), JSON.stringify({ duration: Number(info.format.duration), width: videoStream.width, height: videoStream.height, frameRate: videoStream.avg_frame_rate, video: videoStream.codec_name, audio: audioStream.codec_name, audioSampleRate: audioStream.sample_rate, bytes: Number(info.format.size), realModelReply: manifest.realVoice.text, realAudioPackets: manifest.realVoice.packets, capturedDevices: [], market: 'controlled demo, not live', music: 'original synthesized bed, no samples', scenes: edits.map(({ take, at, length }) => ({ take, at, length })) }, null, 2))
console.log(JSON.stringify({ video, seconds: Number(info.format.duration), bytes: Number(info.format.size), width: 1080, height: 1920 }))
