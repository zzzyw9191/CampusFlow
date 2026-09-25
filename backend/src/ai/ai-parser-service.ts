import type { AIProvider } from './ai-provider.js'
import type { MessageAnalysis } from './message-analysis.js'
import type { MessageContext } from './message-context.js'
import { buildPrompt, parseAnalysis } from './message-parser.js'

export class AIParserService {
  constructor(private readonly provider: AIProvider) {}

  async analyse(context: MessageContext): Promise<MessageAnalysis> {
    const prompt = buildPrompt(context)
    const output = await this.provider.generate(prompt)
    return parseAnalysis(output)
  }
}
