import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildSeeThroughJob, runSeeThroughJob } from '../integrations/see-through.mjs'

const paths = []
afterEach(() => { for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }) })
function fixture() {
  const repo = mkdtempSync(resolve(tmpdir(), 'debby-seethrough-')); paths.push(repo)
  mkdirSync(resolve(repo, 'inference/scripts'), { recursive: true }); mkdirSync(resolve(repo, 'common/utils'), { recursive: true })
  writeFileSync(resolve(repo, 'inference/scripts/inference_psd.py'), '')
  writeFileSync(resolve(repo, 'common/utils/inference_utils.py'), '')
  const input = resolve(repo, '立绘 & hello.png'), output = resolve(repo, 'output with spaces')
  writeFileSync(input, 'fixture'); mkdirSync(output)
  return { repo, input, output }
}
describe('See-through optional authoring adapter', () => {
  it('preserves paths/Unicode as arguments and includes compatible PSD/left-right flags', () => {
    const options = fixture(), job = buildSeeThroughJob({ ...options, python: 'a python.exe', offload: true })
    expect(job.executable).toBe('a python.exe'); expect(job.args[job.args.indexOf('--srcp') + 1]).toBe(options.input)
    expect(job.args).toContain('--save_to_psd'); expect(job.args).toContain('--tblr_split'); expect(job.args).toContain('--group_offload')
    expect(() => buildSeeThroughJob({ ...options, resolution: 123 })).toThrow('resolution')
    const result = spawnSync(process.execPath, [resolve('integrations/see-through.mjs'), '--repo', options.repo, '--input', options.input, '--output', options.output, '--dry-run'], { encoding: 'utf8', windowsHide: true })
    expect(result.status).toBe(0); expect(JSON.parse(result.stdout).args).toContain(options.input)
  })
  it('collects newly generated PSDs, rejects stale output and reports failed child processes', async () => {
    const options = fixture(), plan = buildSeeThroughJob(options)
    writeFileSync(resolve(options.output, 'stale.psd'), 'old')
    const quiet = { write() {} }
    await expect(runSeeThroughJob({ ...plan, executable: process.execPath, args: ['-e', 'process.exit(0)'] }, { output: quiet })).rejects.toThrow('没有 PSD')
    await expect(runSeeThroughJob({ ...plan, executable: process.execPath, args: ['-e', 'process.exit(2)'] }, { output: quiet })).rejects.toThrow('2')
    const path = resolve(options.output, 'new.psd')
    const result = await runSeeThroughJob({ ...plan, executable: process.execPath, args: ['-e', 'require("node:fs").writeFileSync(process.argv[1], "generated")', path] }, { output: quiet })
    expect(result).toEqual([path])
  })
  it('supports process cancellation without pretending a PSD was produced', async () => {
    const plan = buildSeeThroughJob(fixture()), abort = new AbortController()
    const running = runSeeThroughJob({ ...plan, executable: process.execPath, args: ['-e', 'setTimeout(()=>{}, 10000)'] }, { signal: abort.signal, output: { write() {} } })
    abort.abort()
    await expect(running).rejects.toHaveProperty('name', 'AbortError')
  })
})
