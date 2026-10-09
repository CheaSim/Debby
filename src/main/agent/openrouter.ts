import { createModels, type Model } from '@earendil-works/pi-ai'
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter'
import type { StreamFn } from '@earendil-works/pi-agent-core'
import { defaultChatModel, type ChatModel } from '../../shared/chat'

export type AgentFetch = typeof globalThis.fetch
interface CatalogEntry { id?: unknown; name?: unknown; context_length?: unknown; pricing?: Record<string, unknown>; supported_parameters?: unknown; reasoning?: { mandatory?: unknown } }
const zeroPrice = (value: unknown): boolean => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number(value) === 0

export function freeToolModels(data: unknown): ChatModel[] {
  if (!Array.isArray(data)) throw new Error('模型目录格式无效。')
  return data.filter((entry: CatalogEntry) => entry && typeof entry.id === 'string' && typeof entry.name === 'string' &&
    entry.pricing && zeroPrice(entry.pricing.prompt) && zeroPrice(entry.pricing.completion) &&
    Object.values(entry.pricing).every(zeroPrice) &&
    entry.reasoning?.mandatory !== true && Array.isArray(entry.supported_parameters) && entry.supported_parameters.includes('tools'))
    .map((entry) => ({ id: entry.id, name: entry.name, contextLength: Number(entry.context_length) || 4096 }))
    .sort((a, b) => a.id === defaultChatModel ? -1 : b.id === defaultChatModel ? 1 : a.name.localeCompare(b.name))
}

export function chatError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  if (/401|403/.test(text)) return 'API Key 无效或没有访问权限，请检查 BYOK 配置。'
  if (/429/.test(text)) return '免费额度或请求频率达到限制，稍后再试。'
  if (/402/.test(text)) return '账户或 Key 额度受限；Debby 不会自动切换收费模型。'
  if (/timeout|timed out/i.test(text)) return '请求超时，请稍后重试。'
  return '模型服务暂时不可用，请检查网络、模型和 Key 配置。'
}

export class OpenRouterGateway {
  private models: ChatModel[] = []
  private checkedAt = 0
  private readonly registry = createModels()
  constructor(private readonly request: AgentFetch, private readonly baseUrl = 'https://openrouter.ai/api/v1') {
    this.registry.setProvider(openrouterProvider())
  }
  async listModels(force = false, signal?: AbortSignal): Promise<ChatModel[]> {
    if (!force && Date.now() - this.checkedAt < 60_000 && this.models.length) return structuredClone(this.models)
    const response = await this.request(`${this.baseUrl}/models`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000), redirect: 'error' })
    if (!response.ok) throw new Error(`模型目录请求失败 (${response.status})。`)
    const body = await response.json() as { data?: unknown }
    this.models = freeToolModels(body.data)
    this.checkedAt = Date.now()
    return structuredClone(this.models)
  }
  async resolveModel(id: string, signal?: AbortSignal): Promise<Model<'openai-completions'>> {
    // Recheck pricing for every new prompt. Fail closed instead of trusting a stale free label.
    const selected = (await this.listModels(true, signal)).find((model) => model.id === id)
    if (!selected) throw new Error('所选模型已不再免费或不支持工具，请刷新模型列表。')
    return { id: selected.id, name: selected.name, api: 'openai-completions', provider: 'openrouter', baseUrl: this.baseUrl,
      input: ['text'], reasoning: false, contextWindow: selected.contextLength, maxTokens: 1024,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, compat: { supportsStore: false } }
  }
  readonly stream: StreamFn = (model, context, options) => this.registry.streamSimple(model, context, {
    ...options, fetch: this.request, maxTokens: 1024, timeoutMs: 60_000, maxRetries: 0,
    headers: { 'X-Title': 'Debby', 'HTTP-Referer': 'https://github.com/CheaSim/Debby' },
    onPayload: (payload) => ({ ...(payload as object), reasoning: { enabled: false, effort: 'none', exclude: true }, provider: { require_parameters: true, max_price: { prompt: 0, completion: 0 } } })
  })
  async checkKey(key: string): Promise<string> {
    const response = await this.request(`${this.baseUrl}/key`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000), redirect: 'error' })
    if (!response.ok) throw new Error(chatError(new Error(String(response.status))))
    const body = await response.json() as { data?: { free_model_daily_requests?: { remaining?: number; limit?: number } } }
    const quota = body.data?.free_model_daily_requests
    return Number.isFinite(quota?.remaining) ? `连接成功 · 今日免费请求剩余 ${quota!.remaining} / ${quota!.limit ?? '--'}` : '连接成功 · 免费额度由 OpenRouter 账户决定'
  }
}
