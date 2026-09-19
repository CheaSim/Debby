import { app } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import type { MateEngineStatus } from '../shared/types'

let mateEngineProcess: ChildProcess | undefined

export function mateEngineExecutablePath(): string {
  const configured = process.env.FINPET_MATE_ENGINE_EXE?.trim()
  if (configured) return isAbsolute(configured) ? configured : resolve(app.getAppPath(), configured)
  const base = app.isPackaged ? app.getPath('userData') : app.getAppPath()
  return join(base, 'work', 'mate-engine-runtime', 'MateEngineX.exe')
}

export function mateEngineStatus(): MateEngineStatus {
  const executablePath = mateEngineExecutablePath()
  return {
    installed: existsSync(executablePath),
    running: Boolean(mateEngineProcess && !mateEngineProcess.killed),
    executablePath
  }
}

export function startMateEngine(): MateEngineStatus {
  const current = mateEngineStatus()
  if (!current.installed || current.running) return current

  mateEngineProcess = spawn(current.executablePath, [], {
    cwd: dirname(current.executablePath),
    windowsHide: false,
    stdio: 'ignore'
  })
  mateEngineProcess.once('error', (error) => {
    console.error('Mate-Engine failed to start', error)
    mateEngineProcess = undefined
  })
  mateEngineProcess.once('exit', () => { mateEngineProcess = undefined })
  return { ...current, running: true }
}

export function stopMateEngine(): MateEngineStatus {
  if (mateEngineProcess && !mateEngineProcess.killed) mateEngineProcess.kill()
  mateEngineProcess = undefined
  return mateEngineStatus()
}
