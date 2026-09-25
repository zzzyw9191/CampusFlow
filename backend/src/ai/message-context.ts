import type { RawMessage } from '../data/raw-message-repository.js'

export type MessageContext = {
  currentMessage: RawMessage
  recentMessages: RawMessage[]
}
