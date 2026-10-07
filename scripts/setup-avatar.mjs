import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'

export const avatarRevision = '2c5ea6b8f4cf5e1773a0816b46d9267cda5174d4'
export const avatarBlob = '55cec470fb77852ab230dee72ba2588681f8ae29'
export const avatarSize = 27407996
const root = resolve(import.meta.dirname, '..')
export const avatarPath = resolve(root, 'src/renderer/public/models/mate-engine/Zome.vrm')
const source = `https://raw.githubusercontent.com/shinyflvre/Mate-Engine/${avatarRevision}/Assets/MATE%20ENGINE%20-%20Avatar/Zome.vrm`

async function validModel(path) {
  const file = await stat(path).catch(() => undefined)
  if (!file?.isFile() || file.size !== avatarSize) return false
  const hash = createHash('sha1').update(`blob ${file.size}\0`)
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex') === avatarBlob
}

export async function ensureAvatar() {
  if (await validModel(avatarPath)) {
    console.log('Zome 3D avatar is ready (verified local cache).')
    return avatarPath
  }
  await mkdir(dirname(avatarPath), { recursive: true })
  const temporary = `${avatarPath}.download`
  const cached = await stat(temporary).catch(() => undefined)
  const args = ['--fail', '--location', '--retry', '3', '--connect-timeout', '20', '--max-time', '600']
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  if (proxy) args.push('--proxy', proxy)
  if (cached && cached.size > 0 && cached.size < avatarSize) args.push('--continue-at', '-')
  args.push('--output', temporary, source)
  console.log('Downloading Mate-Engine Zome avatar (26 MB)...')
  await new Promise((accept, reject) => {
    const child = spawn('curl.exe', args, { cwd: root, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? accept() : reject(new Error(`Avatar download failed (${code}); rerun npm.cmd run avatar:setup to resume.`)))
  })
  if (!await validModel(temporary)) throw new Error('Zome avatar failed its pinned Git blob verification.')
  await rename(temporary, avatarPath)
  console.log('Zome downloaded and verified. Model by Yorshka; upstream Mate-Engine assets credited to Shiny.')
  return avatarPath
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await ensureAvatar()
