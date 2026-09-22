import type { RawMessage } from '../data/raw-message-repository.js'
import type { AIProvider } from './ai-provider.js'
import type { MessageAnalysis } from './message-analysis.js'
import { buildPrompt, parseAnalysis } from './message-parser.js'

export class AIParserService {
  constructor(private readonly provider: AIProvider) {}

  async analyse(message: RawMessage): Promise<MessageAnalysis> {
    const prompt = buildPrompt(message)
    const output = await this.provider.generate(prompt)
    return parseAnalysis(output)
  }
}
