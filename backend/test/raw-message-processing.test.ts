import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { createRawMessageRepository, type RawMessage } from '../src/data/raw-message-repository.js'
import {
  rawMessageProcessingStateSchema,
  rawMessageProcessingUpdateSchema,
} from '../src/domain/raw-message-processing.js'

function message(sourceMessageId = 'message-1'): RawMessage {
  return {
    source: 'qq', sourceMessageId, conversationId: 'group-1',
    senderId: 'sender-1', senderName: null, content: '原始内容',
    sentAt: 100, rawPayload: '{}',
  }
}

test('new messages default to pending and completed outcomes persist', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const repository = createRawMessageRepository(db)
    for (const outcome of ['created', 'updated', 'cancelled', 'none', 'no_change'] as const) {
      const raw = message(outcome)
      assert.equal(repository.saveRawMessage(raw), true)
      assert.deepEqual(repository.findRawMessageProcessingState('qq', outcome), {
        status: 'pending', outcome: null, processedAt: null, lastError: null,
      })
      const state = repository.setRawMessageProcessingState('qq', outcome, {
        status: 'completed', outcome,
      })
      assert.equal(state?.status, 'completed')
      assert.equal(state.outcome, outcome)
      assert.match(state.processedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
      assert.equal(state.lastError, null)
      assert.deepEqual(repository.findRawMessageProcessingState('qq', outcome), state)
    }
    assert.equal(repository.findRawMessageProcessingState('qq', 'missing'), null)
    assert.equal(repository.setRawMessageProcessingState('qq', 'missing', {
      status: 'completed', outcome: 'none',
    }), null)
  } finally {
    db.close()
  }
})

test('review outcomes and technical failure persist without mixing lastError and outcomes', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const repository = createRawMessageRepository(db)
    for (const outcome of ['ambiguous', 'not_found', 'insufficient_reference'] as const) {
      repository.saveRawMessage(message(outcome))
      const state = repository.setRawMessageProcessingState('qq', outcome, {
        status: 'needs_review', outcome,
      })
      assert.equal(state?.status, 'needs_review')
      assert.equal(state.outcome, outcome)
      assert.equal(state.lastError, null)
    }
    repository.saveRawMessage(message('failed'))
    const failed = repository.setRawMessageProcessingState('qq', 'failed', {
      status: 'failed', lastError: '  SQLite write failed  ',
    })
    assert.equal(failed?.status, 'failed')
    assert.equal(failed.outcome, null)
    assert.equal(failed.lastError, 'SQLite write failed')
    assert.ok(failed.processedAt)
  } finally {
    db.close()
  }
})

test('processing schemas and repository reject illegal status combinations', () => {
  const invalidStates = [
    { status: 'completed', outcome: 'ambiguous', processedAt: 'now', lastError: null },
    { status: 'needs_review', outcome: 'created', processedAt: 'now', lastError: null },
    { status: 'failed', outcome: 'created', processedAt: 'now', lastError: 'error' },
    { status: 'failed', outcome: null, processedAt: 'now', lastError: null },
    { status: 'failed', outcome: null, processedAt: 'now', lastError: '  ' },
    { status: 'pending', outcome: null, processedAt: 'now', lastError: null },
    { status: 'pending', outcome: null, processedAt: null, lastError: 'error' },
  ]
  for (const state of invalidStates) {
    assert.equal(rawMessageProcessingStateSchema.safeParse(state).success, false)
  }
  const invalidUpdates = [
    { status: 'completed', outcome: 'ambiguous' },
    { status: 'needs_review', outcome: 'created' },
    { status: 'failed', outcome: 'created', lastError: 'error' },
    { status: 'failed', lastError: '' },
    { status: 'pending' },
  ]
  for (const update of invalidUpdates) {
    assert.equal(rawMessageProcessingUpdateSchema.safeParse(update).success, false)
  }

  const db = new DatabaseSync(':memory:')
  try {
    const repository = createRawMessageRepository(db)
    repository.saveRawMessage(message())
    for (const update of invalidUpdates) {
      assert.throws(() => repository.setRawMessageProcessingState('qq', 'message-1', update as never))
    }
    assert.deepEqual(repository.findRawMessageProcessingState('qq', 'message-1'), {
      status: 'pending', outcome: null, processedAt: null, lastError: null,
    })
  } finally {
    db.close()
  }
})

test('old raw_messages rows migrate to pending without losing content, and restart is idempotent', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`
      CREATE TABLE raw_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL,
        source_message_id TEXT NOT NULL, conversation_id TEXT, sender_id TEXT,
        sender_name TEXT, content TEXT NOT NULL, sent_at INTEGER NOT NULL,
        raw_payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source, source_message_id)
      )
    `)
    db.prepare(`
      INSERT INTO raw_messages
        (source, source_message_id, conversation_id, sender_id, content, sent_at, raw_payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('qq', 'old', 'group-1', 'sender-1', '原有内容', 100, '{"old":true}')

    const repository = createRawMessageRepository(db)
    assert.deepEqual(repository.findRawMessageProcessingState('qq', 'old'), {
      status: 'pending', outcome: null, processedAt: null, lastError: null,
    })
    const original = db.prepare('SELECT content, raw_payload AS payload FROM raw_messages WHERE source_message_id = ?').get('old')
    assert.equal(original?.content, '原有内容')
    assert.equal(original?.payload, '{"old":true}')
    const columns = db.prepare('PRAGMA table_info(raw_messages)').all().map((row) => row.name)
    for (const name of ['processing_status', 'processing_outcome', 'processed_at', 'last_error']) {
      assert.equal(columns.filter((column) => column === name).length, 1)
    }
    createRawMessageRepository(db)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM raw_messages').get()?.count, 1)
    assert.deepEqual(repository.findRawMessageProcessingState('qq', 'old'), {
      status: 'pending', outcome: null, processedAt: null, lastError: null,
    })
  } finally {
    db.close()
  }
})

test('migration adds only missing columns to a partially migrated table', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`
      CREATE TABLE raw_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL,
        source_message_id TEXT NOT NULL, conversation_id TEXT, sender_id TEXT,
        sender_name TEXT, content TEXT NOT NULL, sent_at INTEGER NOT NULL,
        raw_payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        processing_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (processing_status IN ('pending', 'completed', 'needs_review', 'failed')),
        UNIQUE(source, source_message_id)
      )
    `)
    const repository = createRawMessageRepository(db)
    db.prepare(`
      INSERT INTO raw_messages (source, source_message_id, content, sent_at, raw_payload)
      VALUES ('qq', 'partial', 'content', 100, '{}')
    `).run()
    assert.deepEqual(repository.findRawMessageProcessingState('qq', 'partial'), {
      status: 'pending', outcome: null, processedAt: null, lastError: null,
    })
    createRawMessageRepository(db)
  } finally {
    db.close()
  }
})

test('database enum checks and read validation reject malformed processing data', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const repository = createRawMessageRepository(db)
    repository.saveRawMessage(message())
    assert.throws(() => db.prepare(`
      UPDATE raw_messages SET processing_status = 'processing' WHERE source_message_id = 'message-1'
    `).run(), /CHECK constraint failed/)
    assert.throws(() => db.prepare(`
      UPDATE raw_messages SET processing_outcome = 'other' WHERE source_message_id = 'message-1'
    `).run(), /CHECK constraint failed/)
    db.prepare(`
      UPDATE raw_messages SET processing_status = 'completed',
        processing_outcome = 'ambiguous', processed_at = CURRENT_TIMESTAMP
      WHERE source_message_id = 'message-1'
    `).run()
    assert.throws(() => repository.findRawMessageProcessingState('qq', 'message-1'),
      /RawMessage processing 数据库状态不合法/)
  } finally {
    db.close()
  }
})
