import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { defaultChatModel, type ChatConfig, type ChatConfigInput } from '../../shared/chat'

export interface SecretCipher {
  available: () => boolean
  encrypt: (text: string) => Buffer
  decrypt: (value: Buffer) => string
}
export interface ChatCredentials {
  publicConfig: () => ChatConfig
  getKey: () => string | undefined
  configure: (input: ChatConfigInput) => void
}

export class ChatKeyStore implements ChatCredentials {
  private key?: string
  private config: ChatConfig = { configured: false, modelId: defaultChatModel, cloudConsent: false, storage: 'none' }
  constructor(private readonly path: string, private readonly cipher: SecretCipher) {
    try {
      if (!existsSync(path)) return
      const data = JSON.parse(readFileSync(path, 'utf8'))
      if (typeof data.encryptedKey === 'string' && cipher.available()) this.key = cipher.decrypt(Buffer.from(data.encryptedKey, 'base64'))
      this.config = { configured: Boolean(this.key), modelId: typeof data.modelId === 'string' ? data.modelId : defaultChatModel,
        cloudConsent: data.cloudConsent === true, storage: this.key ? 'encrypted' : 'none' }
    } catch { /* Corrupt or non-decryptable credentials require reconfiguration. */ }
  }
  publicConfig = (): ChatConfig => ({ ...this.config })
  getKey = (): string | undefined => this.key
  configure(input: ChatConfigInput): void {
    if (!input || typeof input.modelId !== 'string' || input.modelId.length > 160 || typeof input.cloudConsent !== 'boolean') throw new Error('配置格式无效。')
    if (input.apiKey !== undefined && typeof input.apiKey !== 'string') throw new Error('API Key 格式无效。')
    const key = input.removeKey ? undefined : input.apiKey === undefined || input.apiKey === '' ? this.key : input.apiKey.trim()
    if (key && (!/^\S{16,512}$/.test(key))) throw new Error('API Key 格式无效。')
    if (key && !this.cipher.available()) throw new Error('系统密钥加密不可用，未保存 API Key。')
    const config: ChatConfig = { configured: Boolean(key), modelId: input.modelId, cloudConsent: input.cloudConsent, storage: key ? 'encrypted' : 'none' }
    const encryptedKey = key ? this.cipher.encrypt(key).toString('base64') : undefined
    writeFileSync(`${this.path}.tmp`, JSON.stringify({ version: 1, modelId: config.modelId, cloudConsent: config.cloudConsent, encryptedKey }), { mode: 0o600 })
    renameSync(`${this.path}.tmp`, this.path)
    this.key = key
    this.config = config
  }
}
