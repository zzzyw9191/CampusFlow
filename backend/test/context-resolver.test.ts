import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { ContextResolver } from '../src/ai/context-resolver.js'
import { createRawMessageRepository, type RawMessage } from '../src/data/raw-message-repository.js'

function message(sourceMessageId: string, sentAt: number, conversationId = 'group-1'): RawMessage {
  return {
    source: 'qq',
    sourceMessageId,
    conversationId,
    senderId: 'sender-1',
    senderName: sourceMessageId === 'first' ? '张同学' : null,
    content: `内容 ${sourceMessageId}`,
    sentAt,
    rawPayload: `{"message_id":"${sourceMessageId}"}`,
  }
}

test('repository returns only earlier messages from the same source and conversation, oldest first', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const repository = createRawMessageRepository(db)
    const current = message('current', 30)
    const first = message('first', 10)
    const second = message('second', 20)
    const sameTime = message('same-time', 30)

    const savedMessages = [
      current, second, message('other-group', 15, 'group-2'), first,
      message('future', 40), sameTime,
    ]
    for (const item of savedMessages) {
      assert.equal(repository.saveRawMessage(item), true)
    }
    db.prepare(`
      INSERT INTO raw_messages (
        source, source_message_id, conversation_id, sender_id, sender_name,
        content, sent_at, raw_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('other', 'other-source', 'group-1', 'sender-1', null, '其他来源', 25, '{}')

    assert.deepEqual(repository.findRecentMessages(current, 10), [first, second, sameTime])
    assert.deepEqual(repository.findRecentMessages(current, 2), [second, sameTime])
    assert.deepEqual(repository.findRecentMessages(current, 0), [])
    assert.throws(() => repository.findRecentMessages(current, -1), RangeError)
  } finally {
    db.close()
  }
})

test('ContextResolver includes the current message and repository history', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const repository = createRawMessageRepository(db)
    const first = message('first', 10)
    const second = message('second', 20)
    const current = message('current', 30)
    for (const item of [first, second, current]) repository.saveRawMessage(item)

    assert.deepEqual(new ContextResolver(repository, 1).resolve(current), {
      currentMessage: current,
      recentMessages: [second],
    })
    assert.deepEqual(new ContextResolver(repository).resolve(current), {
      currentMessage: current,
      recentMessages: [first, second],
    })
  } finally {
    db.close()
  }
})
