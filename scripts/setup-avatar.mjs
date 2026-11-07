import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rename, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'

export const avatarRevision = '94e82dd346fa6cf0337c4421728640e5252dd38e'
export const avatarBlob = '8ee8717df1af676c4ab89c2344d5bcd907d039f9'
export const avatarSize = 10776032
const root = resolve(import.meta.dirname, '..')
export const avatarPath = resolve(root, 'src/renderer/public/models/vrm-sample/Avatar.vrm')
const source = `https://raw.githubusercontent.com/vrm-c/vrm-specification/${avatarRevision}/samples/VRM1_Constraint_Twist_Sample/vrm/VRM1_Constraint_Twist_Sample.vrm`

async function validModel(path) {
  const file = await stat(path).catch(() => undefined)
  if (!file?.isFile() || file.size !== avatarSize) return false
  const hash = createHash('sha1').update(`blob ${file.size}\0`)
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex') === avatarBlob
}

export async function ensureAvatar() {
  if (await validModel(avatarPath)) {
    console.log('Redistributable pixiv 3D avatar ready (verified local cache).')
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
  console.log('Downloading pixiv VRM sample (10 MB)...')
  await new Promise((accept, reject) => {
    const child = spawn('curl.exe', args, { cwd: root, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? accept() : reject(new Error(`Avatar download failed (${code}); rerun npm.cmd run avatar:setup to resume.`)))
  })
  if (!await validModel(temporary)) throw new Error('VRM sample failed its pinned Git blob verification.')
  await rename(temporary, avatarPath)
  console.log('VRM sample verified. (c) 2022 pixiv Inc.; VRM Public License 1.0, redistribution enabled in model metadata.')
  return avatarPath
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await ensureAvatar()
