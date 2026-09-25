import type { AIProvider } from './ai-provider.js'
import type { MessageContext } from './message-context.js'
import type { MessageOperation } from './message-operation.js'
import { buildPrompt, parseOperation } from './message-parser.js'

export class AIParserService {
  constructor(private readonly provider: AIProvider) {}

  async analyse(context: MessageContext): Promise<MessageOperation> {
    const prompt = buildPrompt(context)
    const output = await this.provider.generate(prompt)
    return parseOperation(output)
  }
}
