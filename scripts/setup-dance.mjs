import { createHash } from 'node:crypto'
import { readFile, mkdir, copyFile, readdir, rename, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const target = join(root, 'src/renderer/public/mocap')
const modelName = 'pose_landmarker_full.task'
const digest = '5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1'
const url = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task'
const valid = async file => {
  if ((await stat(file).catch(() => null))?.size !== 9398198) return false
  return createHash('sha256').update(await readFile(file)).digest('hex') === digest
}
export async function ensureDanceAssets() {
  await mkdir(join(target, 'wasm'), { recursive: true })
  // MediaPipe's Emscripten loader needs importScripts. Bundle a classic worker for
  // both Vite dev and packaged file:// pages; dev ESM workers cannot use it.
  await build({ entryPoints: [join(root, 'src/renderer/src/motion/pose.worker.ts')], outfile: join(target, 'pose.worker.js'), bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true, legalComments: 'eof' })
  const wasm = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
  for (const file of await readdir(wasm)) if (/^vision_wasm.*\.(js|wasm)$/.test(file)) await copyFile(join(wasm, file), join(target, 'wasm', file))
  const model = join(target, modelName)
  if (!await valid(model)) {
    const cache = join(root, 'work', modelName)
    if (await valid(cache)) await copyFile(cache, model)
    else {
      console.log('Downloading the pinned MediaPipe Full pose model (9 MB)...')
      const args = ['--silent', '--show-error', '--fail', '--location', '--retry', '2', '--connect-timeout', '20', '--max-time', '240']
      const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
      if (proxy) args.push('--proxy', proxy)
      args.push('--output', `${model}.download`, url)
      await new Promise((accept, reject) => {
        const child = spawn(process.platform === 'win32' ? 'curl.exe' : 'curl', args, { stdio: 'inherit', windowsHide: true })
        child.once('error', reject); child.once('exit', code => code === 0 ? accept() : reject(Error('Pose model download failed; run npm run dance:setup again.')))
      })
      if (!await valid(`${model}.download`)) throw Error('Pose model checksum mismatch.')
      await rename(`${model}.download`, model)
    }
  }
  console.log('Local dance recognition assets ready (MediaPipe 0.10.32 / Full model v1).')
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await ensureDanceAssets()
