/** Optional asset authoring adapter. Never loaded by the desktop app. Apache upstream stays external. */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, delimiter, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const seeThroughRevision = 'df019de5129d6c4b406587a14c3501669441a783'
export function buildSeeThroughJob({ repo, python = 'python', input, output, resolution = 1280, seed = 42, offload = false }) {
  if (!repo || !input || !output) throw Error('需要 --repo、--input 和 --output。')
  if (!Number.isInteger(resolution) || resolution < 512 || resolution > 1280 || resolution % 64) throw Error('resolution 须为 512–1280 之间的 64 倍数。')
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) throw Error('seed 须为非负整数。')
  const cwd = resolve(repo), src = resolve(input), destination = resolve(output)
  if (!existsSync(resolve(cwd, 'inference/scripts/inference_psd.py')) || !existsSync(resolve(cwd, 'common/utils/inference_utils.py'))) throw Error('不是完整的 See-through checkout，请按文档检出固定版本并安装依赖。')
  if (!existsSync(src) || !statSync(src).isFile() || !['.png', '.jpg', '.jpeg', '.webp'].includes(extname(src).toLowerCase())) throw Error('input 须为已有的 PNG/JPEG/WebP 插画。')
  return { executable: python, cwd, args: ['inference/scripts/inference_psd.py', '--srcp', src, '--save_dir', destination, '--save_to_psd', '--tblr_split', '--resolution', String(resolution), '--seed', String(seed), ...(offload ? ['--group_offload'] : [])], output: destination,
    env: { PYTHONPATH: [resolve(cwd, 'common'), resolve(cwd, 'annotators'), process.env.PYTHONPATH].filter(Boolean).join(delimiter), PYTHONUNBUFFERED: '1' } }
}
export function findPsdResults(directory, depth = 0) {
  if (!existsSync(directory) || depth > 3) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? findPsdResults(resolve(directory, item.name), depth + 1) : /\.psd$/i.test(item.name) ? [resolve(directory, item.name)] : [])
}
export function runSeeThroughJob(job, { signal, output = process.stdout } = {}) {
  const signature = path => { const s = statSync(path); return `${s.size}:${s.mtimeMs}` }
  const previous = new Map(findPsdResults(job.output).map(path => [path, signature(path)]))
  return new Promise((resolveJob, reject) => {
    const child = spawn(job.executable, job.args, { cwd: job.cwd, env: { ...process.env, ...job.env }, shell: false, windowsHide: true, signal, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', chunk => output.write(chunk)); child.stderr.on('data', chunk => output.write(chunk))
    child.once('error', reject)
    child.once('close', (code, killed) => {
      if (code !== 0) { reject(Error(`See-through 未完成（${killed || code}）。请检查 GPU、PyTorch 与权重。`)); return }
      const results = findPsdResults(job.output).filter(path => previous.get(path) !== signature(path))
      if (!results.length) reject(Error('推理进程结束，但输出目录没有 PSD。'))
      else resolveJob(results)
    })
  })
}
async function main() {
  const args = process.argv.slice(2), options = {}
  for (let i = 0; i < args.length; i++) {
    if (['--offload', '--dry-run', '--check'].includes(args[i])) options[args[i].slice(2)] = true
    else if (['--repo', '--python', '--input', '--output', '--resolution', '--seed'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) { const key = args[i].slice(2); options[key] = args[++i] }
    else throw Error(`未知或缺少参数：${args[i]}`)
  }
  if (options.resolution !== undefined) options.resolution = Number(options.resolution)
  if (options.seed !== undefined) options.seed = Number(options.seed)
  const job = buildSeeThroughJob(options)
  if (options['dry-run']) { console.log(JSON.stringify({ ...job, env: { PYTHONPATH: job.env.PYTHONPATH, PYTHONUNBUFFERED: '1' }, revision: seeThroughRevision }, null, 2)); return }
  if (options.check) {
    await new Promise((done, reject) => {
      const child = spawn(job.executable, ['-c', 'import torch, diffusers, transformers, psd_tools; from utils import inference_utils; print("torch", torch.__version__, "cuda", torch.cuda.is_available(), "hip", torch.version.hip); assert torch.cuda.is_available(), "Need a supported CUDA/ROCm runtime"'], { cwd: job.cwd, env: { ...process.env, ...job.env }, shell: false, windowsHide: true, stdio: 'inherit' })
      child.once('error', reject); child.once('exit', code => code === 0 ? done() : reject(Error('GPU 推理环境检查未通过。')))
    }); return
  }
  const controller = new AbortController(), abort = () => controller.abort()
  process.once('SIGINT', abort); process.once('SIGTERM', abort)
  try { console.log('将运行本地 See-through；首次运行可能从 Hugging Face 下载权重。完成后在 Debby → 角色工坊导入 PSD。'); console.log(JSON.stringify({ psd: await runSeeThroughJob(job, { signal: controller.signal }) }, null, 2)) }
  finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort) }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1 })
