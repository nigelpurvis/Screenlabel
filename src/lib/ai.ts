import OpenAI from 'openai'
import { getApiKey } from './settings'

export interface DescribeResult {
  description: string
  text: string
}

// Every AI call in the app goes through this interface. Today the only
// implementation is OpenAI (running on the user's own key). Tomorrow, a hosted
// "pay-transparency" tier is just a second implementation behind this same
// interface — no other code in the app has to change. That's the whole point
// of putting an interface here instead of calling OpenAI directly everywhere.
export interface AIProvider {
  describe(imageBase64: string): Promise<DescribeResult>
  embed(input: string): Promise<number[]>
  complete(prompt: string, maxTokens?: number): Promise<string>
}

export class MissingApiKeyError extends Error {
  constructor() {
    super('No OpenAI API key set')
    this.name = 'MissingApiKeyError'
  }
}

class OpenAIProvider implements AIProvider {
  private client: OpenAI

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
  }

  async describe(imageBase64: string): Promise<DescribeResult> {
    const res = await this.client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${imageBase64}` },
            },
            {
              type: 'text',
              text: 'Describe this screenshot in 2-3 sentences. Then list any visible text. Format: DESCRIPTION: ... TEXT: ...',
            },
          ],
        },
      ],
    })
    const raw = res.choices[0].message.content ?? ''
    const description = raw.match(/DESCRIPTION:(.*?)(?=TEXT:|$)/s)?.[1]?.trim() || raw
    const text = raw.match(/TEXT:(.*)/s)?.[1]?.trim() || ''
    return { description, text }
  }

  async embed(input: string): Promise<number[]> {
    const res = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input,
    })
    return res.data[0].embedding
  }

  async complete(prompt: string, maxTokens = 100): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    })
    return res.choices[0].message.content?.trim() ?? ''
  }
}

// Memoize the provider so we don't construct a new client on every call, but
// rebuild it if the key changes (e.g. the user updates it in Settings).
let cached: { key: string; provider: AIProvider } | null = null

export function getProvider(): AIProvider {
  const key = getApiKey()
  if (!key) throw new MissingApiKeyError()
  if (!cached || cached.key !== key) {
    cached = { key, provider: new OpenAIProvider(key) }
  }
  return cached.provider
}
