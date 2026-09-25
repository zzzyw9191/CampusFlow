import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { createCampusItemRepository } from '../src/data/campus-item-repository.js'
import { createCampusItemOperationRepository } from '../src/data/campus-item-operation-repository.js'
import type { CreateCampusItemInput } from '../src/domain/campus-item.js'
import { toCampusItemStateSnapshot } from '../src/domain/campus-item-operation.js'

function itemInput(title: string): CreateCampusItemInput {
  return {
    kind: 'task', title, course: '人工智能', deadline: '2026-09-28',
    eventTime: null, location: null, description: '提交至学习通', source: 'qq',
    conversationId: 'group-1', originSourceMessageId: 'message-1',
  }
}

test('snapshot helper keeps only business state fields', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const item = createCampusItemRepository(db).createCampusItem(itemInput('第三章作业'))
    assert.deepEqual(toCampusItemStateSnapshot(item), {
      kind: 'task', status: 'active', title: '第三章作业', course: '人工智能',
      deadline: '2026-09-28', eventTime: null, location: null,
      description: '提交至学习通',
    })
  } finally {
    db.close()
  }
})

test('create, update, and cancel audit snapshots round-trip in ID order and item scope', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const items = createCampusItemRepository(db)
    const operations = createCampusItemOperationRepository(db)
    const first = items.createCampusItem(itemInput('第三章作业'))
    const second = items.createCampusItem(itemInput('第四章作业'))
    const initial = toCampusItemStateSnapshot(first)
    const created = operations.recordCampusItemOperation({
      campusItemId: first.id, action: 'create', source: 'qq', sourceMessageId: 'm1',
      beforeState: null, afterState: initial,
    })
    const changedItem = items.updateCampusItem(first.id, { deadline: '2026-09-30', location: '信息楼302' })
    assert.ok(changedItem)
    const changed = toCampusItemStateSnapshot(changedItem)
    const updated = operations.recordCampusItemOperation({
      campusItemId: first.id, action: 'update', source: 'qq', sourceMessageId: 'm2',
      beforeState: initial, afterState: changed,
    })
    const cancelledItem = items.cancelCampusItem(first.id)
    assert.ok(cancelledItem)
    const cancelled = operations.recordCampusItemOperation({
      campusItemId: first.id, action: 'cancel', source: 'qq', sourceMessageId: 'm3',
      beforeState: changed, afterState: toCampusItemStateSnapshot(cancelledItem),
    })
    operations.recordCampusItemOperation({
      campusItemId: second.id, action: 'create', source: 'qq', sourceMessageId: 'm4',
      beforeState: null, afterState: toCampusItemStateSnapshot(second),
    })

    assert.ok(created.id < updated.id && updated.id < cancelled.id)
    assert.equal(created.beforeState, null)
    assert.deepEqual(created.afterState, initial)
    assert.deepEqual(updated.beforeState, initial)
    assert.deepEqual(updated.afterState, changed)
    assert.deepEqual(cancelled.beforeState, changed)
    assert.equal(cancelled.afterState.status, 'cancelled')
    assert.deepEqual(operations.findCampusItemOperations(first.id), [created, updated, cancelled])
    assert.equal(operations.findCampusItemOperations(second.id).length, 1)
    assert.equal(operations.findCampusItemOperations(999).length, 0)
    const raw = db.prepare('SELECT before_state AS beforeState, after_state AS afterState FROM campus_item_operations WHERE id = ?').get(created.id)
    assert.equal(raw?.beforeState, null)
    assert.deepEqual(JSON.parse(String(raw?.afterState)), initial)
  } finally {
    db.close()
  }
})

test('invalid action and structured snapshots are rejected', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const item = createCampusItemRepository(db).createCampusItem(itemInput('第三章作业'))
    const operations = createCampusItemOperationRepository(db)
    const valid = {
      campusItemId: item.id, action: 'create' as const,
      source: 'qq', sourceMessageId: 'm1', beforeState: null,
      afterState: toCampusItemStateSnapshot(item),
    }
    assert.throws(() => operations.recordCampusItemOperation({ ...valid, action: 'remove' } as never))
    assert.throws(() => operations.recordCampusItemOperation({ ...valid, afterState: '{}' } as never))
    assert.throws(() => operations.recordCampusItemOperation({ ...valid, id: 5 } as never))
    assert.throws(() => db.prepare(`
      INSERT INTO campus_item_operations (campus_item_id, action, source, source_message_id, after_state)
      VALUES (?, ?, ?, ?, ?)
    `).run(item.id, 'remove', 'qq', 'm2', '{}'), /CHECK constraint failed/)
  } finally {
    db.close()
  }
})

test('the current SQLite connection enforces the audit foreign key', () => {
  const db = new DatabaseSync(':memory:')
  try {
    createCampusItemRepository(db)
    createCampusItemOperationRepository(db)
    assert.equal(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1)
    assert.throws(() => db.prepare(`
      INSERT INTO campus_item_operations (campus_item_id, action, source, source_message_id, after_state)
      VALUES (?, 'create', 'qq', 'm1', ?)
    `).run(999, '{}'), /FOREIGN KEY constraint failed/)
  } finally {
    db.close()
  }
})

test('find detects invalid JSON and invalid snapshot structure', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const item = createCampusItemRepository(db).createCampusItem(itemInput('第三章作业'))
    const operations = createCampusItemOperationRepository(db)
    const valid = JSON.stringify(toCampusItemStateSnapshot(item))
    const insert = db.prepare(`
      INSERT INTO campus_item_operations (campus_item_id, action, source, source_message_id, before_state, after_state)
      VALUES (?, 'update', 'qq', 'm1', ?, ?)
    `)
    const result = insert.run(item.id, 'not JSON', valid)
    assert.throws(() => operations.findCampusItemOperations(item.id), /before_state JSON 或 Snapshot 格式不合法/)
    db.prepare('UPDATE campus_item_operations SET before_state = ? WHERE id = ?').run(valid, result.lastInsertRowid)
    db.prepare('UPDATE campus_item_operations SET after_state = ? WHERE id = ?').run('{"title":"incomplete"}', result.lastInsertRowid)
    assert.throws(() => operations.findCampusItemOperations(item.id), /after_state JSON 或 Snapshot 格式不合法/)
  } finally {
    db.close()
  }
})

test('source and sourceMessageId form the unique mutation key and support exact lookup', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const items = createCampusItemRepository(db)
    const item = items.createCampusItem(itemInput('第三章作业'))
    const otherItem = items.createCampusItem(itemInput('第四章作业'))
    const repository = createCampusItemOperationRepository(db)
    const base = {
      campusItemId: item.id, action: 'create' as const,
      source: 'qq', sourceMessageId: 'message-1', beforeState: null,
      afterState: toCampusItemStateSnapshot(item),
    }
    const first = repository.recordCampusItemOperation(base)
    assert.deepEqual(repository.findCampusItemOperationBySourceMessage('qq', 'message-1'), first)
    assert.equal(repository.findCampusItemOperationBySourceMessage('qq', 'missing'), null)
    assert.equal(repository.findCampusItemOperationBySourceMessage('other', 'message-1'), null)
    assert.throws(() => repository.recordCampusItemOperation(base), /UNIQUE constraint failed/)
    assert.throws(() => repository.recordCampusItemOperation({
      ...base, campusItemId: otherItem.id,
    }), /UNIQUE constraint failed/)
    const differentMessage = repository.recordCampusItemOperation({ ...base, sourceMessageId: 'message-2' })
    const differentSource = repository.recordCampusItemOperation({ ...base, source: 'other' })
    assert.notEqual(differentMessage.id, first.id)
    assert.notEqual(differentSource.id, first.id)
    assert.deepEqual(repository.findCampusItemOperationBySourceMessage('qq', 'message-2'), differentMessage)
    assert.deepEqual(repository.findCampusItemOperationBySourceMessage('other', 'message-1'), differentSource)
    createCampusItemOperationRepository(db)
  } finally {
    db.close()
  }
})

test('legacy duplicate mutation keys fail closed before creating the unique index', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const item = createCampusItemRepository(db).createCampusItem(itemInput('第三章作业'))
    db.exec(`
      CREATE TABLE campus_item_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, campus_item_id INTEGER NOT NULL,
        action TEXT NOT NULL, source TEXT NOT NULL, source_message_id TEXT NOT NULL,
        before_state TEXT, after_state TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    const insert = db.prepare(`
      INSERT INTO campus_item_operations
        (campus_item_id, action, source, source_message_id, after_state)
      VALUES (?, 'create', 'qq', 'duplicate', ?)
    `)
    const snapshot = JSON.stringify(toCampusItemStateSnapshot(item))
    insert.run(item.id, snapshot)
    insert.run(item.id, snapshot)
    assert.throws(() => createCampusItemOperationRepository(db), /历史存在重复 source \+ source_message_id/)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM campus_item_operations').get()?.count, 2)
  } finally {
    db.close()
  }
})
