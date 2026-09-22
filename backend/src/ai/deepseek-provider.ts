import type { AIProvider } from './ai-provider.js'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_MODEL = 'deepseek-flash'

type JsonObject = Record<string, unknown>

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readContent(response: unknown): string {
  if (!isJsonObject(response) || !Array.isArray(response.choices)) {
    throw new Error('DeepSeek API 返回结构异常：缺少 choices')
  }

  const firstChoice = response.choices[0]
  if (!isJsonObject(firstChoice) || !isJsonObject(firstChoice.message)) {
    throw new Error('DeepSeek API 返回结构异常：缺少 message')
  }

  const content = firstChoice.message.content
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('DeepSeek 返回了空的模型内容')
  }

  return content
}

export class DeepSeekProvider implements AIProvider {
  private readonly apiKey: string

  constructor(apiKey = process.env.DEEPSEEK_API_KEY) {
    if (apiKey === undefined || apiKey.trim() === '') {
      throw new Error('缺少环境变量 DEEPSEEK_API_KEY')
    }

    this.apiKey = apiKey
  }

  async generate(prompt: string): Promise<string> {
    let response: Response

    try {
      response = await fetch(DEEPSEEK_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          max_tokens: 1_000,
          stream: false,
        }),
      })
    } catch (error) {
      throw new Error('DeepSeek API 网络请求失败', { cause: error })
    }

    if (!response.ok) {
      throw new Error(
        `DeepSeek API 请求失败：HTTP ${response.status} ${response.statusText}`.trim(),
      )
    }

    let responseBody: unknown
    try {
      responseBody = await response.json()
    } catch (error) {
      throw new Error('DeepSeek API 返回的响应不是有效 JSON', { cause: error })
    }

    return readContent(responseBody)
  }
}
