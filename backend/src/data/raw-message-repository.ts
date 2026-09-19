import type { DatabaseSync } from 'node:sqlite'

export type RawMessage = {
  source: 'qq'
  sourceMessageId: string
  conversationId: string
  senderId: string
  senderName: string | null
  content: string
  sentAt: number
  rawPayload: string
}

export function createRawMessageRepository(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      source_message_id TEXT NOT NULL,
      conversation_id TEXT,
      sender_id TEXT,
      sender_name TEXT,
      content TEXT NOT NULL,
      sent_at INTEGER NOT NULL,
      raw_payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source, source_message_id)
    )
  `)

  const insertRawMessage = db.prepare(`
    INSERT INTO raw_messages (
      source,
      source_message_id,
      conversation_id,
      sender_id,
      sender_name,
      content,
      sent_at,
      raw_payload
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source, source_message_id) DO NOTHING
  `)

  return {
    saveRawMessage(message: RawMessage) {
      const result = insertRawMessage.run(
        message.source,
        message.sourceMessageId,
        message.conversationId,
        message.senderId,
        message.senderName,
        message.content,
        message.sentAt,
        message.rawPayload,
      )

      return result.changes > 0
    },
  }
}
