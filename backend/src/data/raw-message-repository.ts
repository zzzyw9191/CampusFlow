import type { DatabaseSync } from 'node:sqlite'
import {
  rawMessageProcessingStateSchema,
  rawMessageProcessingUpdateSchema,
  type RawMessageProcessingState,
  type RawMessageProcessingUpdate,
} from '../domain/raw-message-processing.js'

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
      processing_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (processing_status IN ('pending', 'completed', 'needs_review', 'failed')),
      processing_outcome TEXT
        CHECK (processing_outcome IN (
          'created', 'updated', 'cancelled', 'none', 'no_change',
          'ambiguous', 'not_found', 'insufficient_reference'
        )),
      processed_at TEXT,
      last_error TEXT,
      UNIQUE(source, source_message_id)
    )
  `)

  const columns = new Set(db.prepare('PRAGMA table_info(raw_messages)').all().map((row) => row.name))
  if (!columns.has('processing_status')) {
    db.exec(`ALTER TABLE raw_messages ADD COLUMN processing_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (processing_status IN ('pending', 'completed', 'needs_review', 'failed'))`)
  }
  if (!columns.has('processing_outcome')) {
    db.exec(`ALTER TABLE raw_messages ADD COLUMN processing_outcome TEXT
      CHECK (processing_outcome IN (
        'created', 'updated', 'cancelled', 'none', 'no_change',
        'ambiguous', 'not_found', 'insufficient_reference'
      ))`)
  }
  if (!columns.has('processed_at')) db.exec('ALTER TABLE raw_messages ADD COLUMN processed_at TEXT')
  if (!columns.has('last_error')) db.exec('ALTER TABLE raw_messages ADD COLUMN last_error TEXT')

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
  const selectProcessingState = db.prepare(`
    SELECT processing_status AS status, processing_outcome AS outcome,
      processed_at AS processedAt, last_error AS lastError
    FROM raw_messages
    WHERE source = ? AND source_message_id = ?
  `)
  const updateProcessingState = db.prepare(`
    UPDATE raw_messages
    SET processing_status = ?, processing_outcome = ?,
      processed_at = CURRENT_TIMESTAMP, last_error = ?
    WHERE source = ? AND source_message_id = ?
  `)

  function findRawMessageProcessingState(
    source: string,
    sourceMessageId: string,
  ): RawMessageProcessingState | null {
    const row = selectProcessingState.get(source, sourceMessageId)
    if (row === undefined) return null
    const parsed = rawMessageProcessingStateSchema.safeParse(row)
    if (!parsed.success) throw new Error('RawMessage processing 数据库状态不合法')
    return parsed.data
  }

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

    findRawMessageProcessingState,
    setRawMessageProcessingState(
      source: string,
      sourceMessageId: string,
      input: RawMessageProcessingUpdate,
    ): RawMessageProcessingState | null {
      const state = rawMessageProcessingUpdateSchema.parse(input)
      const outcome = state.status === 'failed' ? null : state.outcome
      const lastError = state.status === 'failed' ? state.lastError : null
      const result = updateProcessingState.run(state.status, outcome, lastError, source, sourceMessageId)
      return result.changes === 0 ? null : findRawMessageProcessingState(source, sourceMessageId)
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
