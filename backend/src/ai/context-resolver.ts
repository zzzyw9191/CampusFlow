import type { RawMessage, createRawMessageRepository } from '../data/raw-message-repository.js'
import type { MessageContext } from './message-context.js'

export const DEFAULT_RECENT_MESSAGE_LIMIT = 20

type RawMessageRepository = Pick<ReturnType<typeof createRawMessageRepository>, 'findRecentMessages'>

export class ContextResolver {
  constructor(
    private readonly repository: RawMessageRepository,
    private readonly recentMessageLimit = DEFAULT_RECENT_MESSAGE_LIMIT,
  ) {}

  resolve(currentMessage: RawMessage): MessageContext {
    return {
      currentMessage,
      recentMessages: this.repository.findRecentMessages(currentMessage, this.recentMessageLimit),
    }
  }
}
