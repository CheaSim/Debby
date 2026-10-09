import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { emptyVoiceState, type VoiceConfig, type VoiceConfigInput } from '../../shared/voice'
import type { SecretCipher } from '../agent/key-store'

export function loadLocalEnvironment(path: string, env: NodeJS.ProcessEnv): void {
  if (!existsSync(path)) return
  const values = parseEnv(readFileSync(path, 'utf8'))
  for (const [key, value] of Object.entries(values)) {
    if (/^(DEBBY_QWEN_|FINPET_MARKET_WS$)/.test(key) && env[key] === undefined) env[key] = value
  }
}

export function validateVoiceConfig(input: VoiceConfigInput): VoiceConfigInput {
  if (!input || typeof input.baseUrl !== 'string') throw new Error('语音配置格式无效。')
  let url: URL
  try { url = new URL(input.baseUrl) } catch { throw new Error('请输入百炼 HTTPS Base URL。') }
  const official = /^(?:token-plan\.cn-beijing\.maas\.aliyuncs\.com|[a-z0-9-]+\.(?:cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com|dashscope(?:-intl)?\.aliyuncs\.com)$/.test(url.hostname)
  if (!official || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port || !/^\/compatible-mode\/v1\/?$/.test(url.pathname)) throw new Error('仅支持百炼官方 Base URL，不会向自定义地址转发 Key。')
  for (const value of [input.textModel, input.asrModel, input.ttsModel]) if (typeof value !== 'string' || !/^qwen[a-z0-9.:-]{1,100}$/.test(value)) throw new Error('请输入有效的千问模型 ID。')
  if (typeof input.voice !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(input.voice)) throw new Error('音色 ID 格式无效。')
  if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || (input.apiKey.trim() && !/^\S{16,512}$/.test(input.apiKey.trim())))) throw new Error('API Key 格式无效。')
  return { baseUrl: `${url.origin}/compatible-mode/v1`, textModel: input.textModel, asrModel: input.asrModel, ttsModel: input.ttsModel, voice: input.voice, apiKey: input.apiKey }
}

export class VoiceConfigStore {
  private input: VoiceConfigInput
  private key?: string
  private storage: VoiceConfig['storage'] = 'none'
  constructor(private readonly path: string, private readonly cipher: SecretCipher, env: NodeJS.ProcessEnv = {}) {
    const defaults = emptyVoiceState().config
    this.input = validateVoiceConfig({ baseUrl: env.DEBBY_QWEN_BASE_URL || defaults.baseUrl, textModel: env.DEBBY_QWEN_TEXT_MODEL || defaults.textModel,
      asrModel: env.DEBBY_QWEN_ASR_MODEL || defaults.asrModel, ttsModel: env.DEBBY_QWEN_TTS_MODEL || defaults.ttsModel, voice: env.DEBBY_QWEN_VOICE || defaults.voice,
      apiKey: env.DEBBY_QWEN_API_KEY })
    this.key = this.input.apiKey?.trim() || undefined
    delete this.input.apiKey
    this.storage = this.key ? 'env' : 'none'
    try {
      if (existsSync(path) && cipher.available()) {
        const saved = JSON.parse(readFileSync(path, 'utf8'))
        const input = validateVoiceConfig(JSON.parse(cipher.decrypt(Buffer.from(saved.encrypted, 'base64'))))
        this.key = input.apiKey?.trim() || undefined
        delete input.apiKey
        this.input = input
        this.storage = this.key ? 'encrypted' : 'none'
      }
    } catch { /* Retain valid local configuration if an encrypted override is unreadable. */ }
  }
  getKey = (): string | undefined => this.key
  publicConfig = (): VoiceConfig => ({ ...this.input, configured: Boolean(this.key), storage: this.storage,
    vision: ['qwen3.8-flash', 'qwen3.8-max', 'qwen3.7-plus', 'qwen3.6-plus', 'qwen3.6-flash'].includes(this.input.textModel),
    tokenPlan: new URL(this.input.baseUrl).hostname.startsWith('token-plan.') })
  configure(input: VoiceConfigInput): void {
    const next = validateVoiceConfig(input)
    const key = next.apiKey?.trim() || this.key
    if (!this.cipher.available()) throw new Error('系统密钥加密不可用，配置未保存。')
    const encrypted = this.cipher.encrypt(JSON.stringify({ ...next, apiKey: key })).toString('base64')
    writeFileSync(`${this.path}.tmp`, JSON.stringify({ version: 1, encrypted }), { mode: 0o600 })
    renameSync(`${this.path}.tmp`, this.path)
    delete next.apiKey
    this.input = next
    this.key = key
    this.storage = key ? 'encrypted' : 'none'
  }
}
