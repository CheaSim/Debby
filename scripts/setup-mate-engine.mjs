import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const workDir = join(root, 'work')
const runtimeDir = join(workDir, 'mate-engine-runtime')
const extractDir = join(workDir, 'mate-engine-extracting')
const apiUrl = 'https://api.github.com/repos/shinyflvre/Mate-Engine/releases/latest'
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7897'

function curl(args) {
  const result = spawnSync('curl.exe', ['--proxy', proxy, '--fail', '--location', '--retry', '3', ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8
  })
  if (result.status !== 0) throw new Error(result.stderr || `curl exited with ${result.status}`)
  return result.stdout
}

function powershell(command) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 2
  })
  if (result.status !== 0) throw new Error(result.stderr || `PowerShell exited with ${result.status}`)
}

async function findExecutable(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === 'mateenginex.exe') return path
    if (entry.isDirectory()) {
      const nested = await findExecutable(path)
      if (nested) return nested
    }
  }
  return undefined
}

const existing = join(runtimeDir, 'MateEngineX.exe')
try {
  await stat(existing)
  console.log(`Mate-Engine already installed: ${existing}`)
  process.exit(0)
} catch {}

await mkdir(workDir, { recursive: true })
const release = JSON.parse(curl(['--header', 'Accept: application/vnd.github+json', apiUrl]))
const asset = release.assets?.find((item) => item.name?.toLowerCase().endsWith('.zip'))
if (!asset?.browser_download_url) throw new Error('Latest Mate-Engine release has no ZIP asset')

const archive = join(workDir, asset.name)
try {
  const cached = await stat(archive)
  if (cached.size === asset.size) {
    console.log(`Using cached archive: ${archive}`)
  } else {
    console.log(`Resuming download at ${Math.round(cached.size / 1024 / 1024)} MB...`)
    curl(['--continue-at', '-', '--output', archive, asset.browser_download_url])
  }
} catch {
  console.log(`Downloading ${asset.name} (${Math.round(asset.size / 1024 / 1024)} MB)...`)
  curl(['--output', archive, asset.browser_download_url])
}

const hash = createHash('sha256')
for await (const chunk of createReadStream(archive)) hash.update(chunk)
const actualDigest = `sha256:${hash.digest('hex')}`
if (asset.digest && actualDigest !== asset.digest) throw new Error(`Mate-Engine archive digest mismatch: ${actualDigest}`)

await rm(extractDir, { recursive: true, force: true })
await mkdir(extractDir, { recursive: true })
const quote = (value) => `'${value.replaceAll("'", "''")}'`
powershell(`Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(extractDir)} -Force`)
const extractedExe = await findExecutable(extractDir)
if (!extractedExe) throw new Error('MateEngineX.exe was not found after extraction')

await rm(runtimeDir, { recursive: true, force: true })
await cp(dirname(extractedExe), runtimeDir, { recursive: true, force: true })
await rm(extractDir, { recursive: true, force: true })
console.log(`Mate-Engine ready: ${existing}`)
console.log('Start FinPet and use the tray menu item "启动 Mate-Engine 3D".')
