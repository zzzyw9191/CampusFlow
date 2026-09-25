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

  const selectRecentMessages = db.prepare(`
    SELECT
      source,
      source_message_id AS sourceMessageId,
      conversation_id AS conversationId,
      sender_id AS senderId,
      sender_name AS senderName,
      content,
      sent_at AS sentAt,
      raw_payload AS rawPayload
    FROM raw_messages
    WHERE source = ?
      AND conversation_id = ?
      AND source_message_id <> ?
      AND sent_at <= ?
    ORDER BY sent_at DESC, id DESC
    LIMIT ?
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

    findRecentMessages(message: RawMessage, limit: number): RawMessage[] {
      if (!Number.isSafeInteger(limit) || limit < 0) {
        throw new RangeError('历史消息数量必须是非负安全整数')
      }

      const rows = selectRecentMessages.all(
        message.source,
        message.conversationId,
        message.sourceMessageId,
        message.sentAt,
        limit,
      )

      return rows.map((row): RawMessage => {
        if (
          row.source !== 'qq' ||
          typeof row.sourceMessageId !== 'string' ||
          typeof row.conversationId !== 'string' ||
          typeof row.senderId !== 'string' ||
          (row.senderName !== null && typeof row.senderName !== 'string') ||
          typeof row.content !== 'string' ||
          typeof row.sentAt !== 'number' ||
          typeof row.rawPayload !== 'string'
        ) {
          throw new Error('历史消息数据库行不符合 RawMessage 格式')
        }

        return {
          source: row.source,
          sourceMessageId: row.sourceMessageId,
          conversationId: row.conversationId,
          senderId: row.senderId,
          senderName: row.senderName,
          content: row.content,
          sentAt: row.sentAt,
          rawPayload: row.rawPayload,
        }
      }).reverse()
    },
  }
}
