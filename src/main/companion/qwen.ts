import { createModels, type Model } from '@earendil-works/pi-ai'
import { qwenTokenPlanCnProvider } from '@earendil-works/pi-ai/providers/qwen-token-plan-cn'
import type { StreamFn } from '@earendil-works/pi-agent-core'
import type { VoiceConfig } from '../../shared/voice'
import { voiceLimits } from '../../shared/voice'
import type { AgentFetch } from '../agent/openrouter'

export interface SpeechProvider {
  transcribe: (audio: Uint8Array, signal: AbortSignal) => Promise<string>
  synthesize: (text: string, signal: AbortSignal) => Promise<Uint8Array>
}
export async function boundedBytes(response: Response, max: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > max) { await response.body?.cancel(); throw new Error('服务响应超过大小限制。') }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('服务返回了空响应。')
  const parts: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > max) { await reader.cancel(); throw new Error('服务响应超过大小限制。') }
      parts.push(chunk.value)
    }
    const result = new Uint8Array(size)
    let offset = 0
    for (const part of parts) { result.set(part, offset); offset += part.length }
    return result
  } finally { reader.releaseLock() }
}
export function voiceError(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (/401|403|InvalidApiKey|AccessDenied/i.test(message)) return '百炼 Key 或模型权限不可用，请检查所属套餐与地域。'
  if (/429|Throttling|Quota/i.test(message)) return '模型额度或调用频率受限，稍后再试。'
  if (/404|ModelNotFound|InvalidModel/i.test(message)) return '模型或接口不可用，请检查百炼配置。'
  if (/timeout|Timeout|timed out/.test(message)) return '语音请求超时，请重试。'
  if (/大小限制|空响应|未识别到|文本过长|无效音频/.test(message)) return message
  return '语音服务暂时不可用。请检查网络和模型配置，文字回复会保留。'
}

export class QwenGateway implements SpeechProvider {
  private readonly registry = createModels()
  constructor(private readonly request: AgentFetch, private readonly config: VoiceConfig, private readonly getKey: () => string | undefined) {
    this.registry.setProvider(qwenTokenPlanCnProvider())
  }
  listModels = async () => [{ id: this.config.textModel, name: this.config.textModel, contextLength: 128_000 }]
  resolveModel = async (): Promise<Model<'openai-completions'>> => ({ id: this.config.textModel, name: this.config.textModel,
    api: 'openai-completions', provider: 'qwen-token-plan-cn', baseUrl: this.config.baseUrl, reasoning: false,
    input: this.config.vision ? ['text', 'image'] : ['text'], contextWindow: 128_000, maxTokens: 512,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' } })
  readonly stream: StreamFn = (model, context, options) => this.registry.streamSimple(model, context, {
    ...options, fetch: this.request, maxTokens: 512, timeoutMs: 60_000, maxRetries: 0,
    onPayload: (payload) => ({ ...(payload as object), enable_thinking: false })
  })
  checkKey = async (): Promise<string> => '请主动发起对话验证；语音调用会消耗你的百炼额度。'
  private async post(path: string, body: object, signal: AbortSignal): Promise<Response> {
    const key = this.getKey()
    if (!key) throw new Error('InvalidApiKey')
    const response = await this.request(`${new URL(this.config.baseUrl).origin}${path}`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-DashScope-SSE': 'disable' },
      body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)])
    })
    if (!response.ok) { await response.body?.cancel(); throw new Error(String(response.status)) }
    return response
  }
  async transcribe(audio: Uint8Array, signal: AbortSignal): Promise<string> {
    const response = await this.post('/api/v1/services/aigc/multimodal-generation/generation', {
      model: this.config.asrModel,
      input: { messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:audio/wav;base64,${Buffer.from(audio).toString('base64')}` } }] }] },
      parameters: { format: 'wav', sample_rate: '16000', language_hints: ['zh', 'en'] }
    }, signal)
    const body = JSON.parse(new TextDecoder().decode(await boundedBytes(response, 200_000)))
    if (body.code) throw new Error(String(body.code))
    const text = body.output?.text
    if (typeof text !== 'string' || !text.trim()) throw new Error('未识别到清晰语音，请再说一次。')
    if (text.length > 4000) throw new Error('识别文本过长，请缩短语音。')
    return text.trim()
  }
  async synthesize(text: string, signal: AbortSignal): Promise<Uint8Array> {
    if (text.length > 1200) throw new Error('回复文本过长，已保留文字，请缩小问题范围。')
    // Token Plan exposes a binary HTTP TTS extension, not Chat Completions audio output.
    const response = await this.post('/api/v1/services/audio/tts/SpeechSynthesizer', {
      model: this.config.ttsModel, input: { text, voice: this.config.voice, format: 'mp3', sample_rate: 24_000 }
    }, signal)
    const json = response.headers.get('content-type')?.includes('json')
    let bytes = await boundedBytes(response, json ? Math.ceil(voiceLimits.responseBytes * 4 / 3) + 200_000 : voiceLimits.responseBytes)
    if (json) {
      const body = JSON.parse(new TextDecoder().decode(bytes))
      bytes.fill(0)
      if (body.code) throw new Error(String(body.code))
      const audio = body.output?.audio
      if (typeof audio?.data === 'string' && audio.data) {
        if (audio.data.length > Math.ceil(voiceLimits.responseBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio.data) || audio.data.length % 4) throw new Error('无效音频响应。')
        bytes = new Uint8Array(Buffer.from(audio.data, 'base64'))
      } else if (typeof audio?.url === 'string') {
        const url = new URL(audio.url)
        if (url.protocol !== 'https:' || url.hostname !== 'dashscope-result-bj.oss-cn-beijing.aliyuncs.com' || url.username || url.password || url.port || url.hash) throw new Error('无效音频地址。')
        // Signed audio URLs never receive the API key and are never exposed to the renderer.
        const download = await this.request(url.toString(), { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) })
        if (!download.ok) { await download.body?.cancel(); throw new Error(String(download.status)) }
        bytes = await boundedBytes(download, voiceLimits.responseBytes)
      } else throw new Error('无效音频响应。')
    }
    if (bytes.length > voiceLimits.responseBytes) { bytes.fill(0); throw new Error('服务响应超过大小限制。') }
    if (!bytes.length) throw new Error('服务返回了空响应。')
    return bytes
  }
}
