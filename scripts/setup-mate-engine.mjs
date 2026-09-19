import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const workDir = join(root, 'work')
const runtimeDir = join(workDir, 'mate-engine-runtime')
const extractDir = join(workDir, 'mate-engine-extracting')
const modelDir = join(runtimeDir, 'cases')
const modelPath = join(modelDir, 'Zome.vrm')
const profileDir = join(runtimeDir, 'profile')
const apiUrl = 'https://api.github.com/repos/shinyflvre/Mate-Engine/releases/latest'
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || 'http://127.0.0.1:7897'
const zomeUrl = 'https://raw.githubusercontent.com/shinyflvre/Mate-Engine/main/Assets/MATE%20ENGINE%20-%20Avatar/Zome.vrm'
const zomeSize = 27407996

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
let installed = false
try {
  await stat(existing)
  installed = true
  console.log(`Mate-Engine already installed: ${existing}`)
} catch {
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
  installed = true
}

await mkdir(modelDir, { recursive: true })
try {
  const cachedModel = await stat(modelPath)
  if (cachedModel.size !== zomeSize) {
    console.log('Refreshing incomplete Zome.vrm case...')
    curl(['--continue-at', '-', '--output', modelPath, zomeUrl])
  } else {
    console.log(`Using cached Zome.vrm case: ${modelPath}`)
  }
} catch {
  console.log('Downloading Mate-Engine Zome.vrm case (about 26 MB)...')
  curl(['--output', modelPath, zomeUrl])
}
const finalModel = await stat(modelPath)
if (finalModel.size !== zomeSize) throw new Error(`Zome.vrm size mismatch: ${finalModel.size}`)

await mkdir(profileDir, { recursive: true })
await writeFile(join(profileDir, 'settings.json'), JSON.stringify({
  selectedModelPath: modelPath,
  selectedLocaleCode: 'zh',
  isTopmost: true,
  enableMouseTracking: true,
  bloom: true,
  ambientOcclusion: true,
  enableParticles: true,
  enableRandomAvatar: false
}, null, 2), 'utf8')
if (!installed) throw new Error('Mate-Engine installation did not complete')
console.log(`Mate-Engine ready: ${existing}`)
console.log(`Default case: ${modelPath}`)
console.log('Start FinPet and use the tray menu item "启动 Mate-Engine Zome 案例".')
