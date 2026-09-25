import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { createActionExecutor } from '../src/application/action-executor.js'
import { createCampusItemOperationRepository } from '../src/data/campus-item-operation-repository.js'
import { createCampusItemRepository } from '../src/data/campus-item-repository.js'
import type { CampusItem, CreateCampusItemInput } from '../src/domain/campus-item.js'
import { toCampusItemStateSnapshot } from '../src/domain/campus-item-operation.js'
import type { EntityResolution } from '../src/domain/entity-resolver.js'

const provenance = { source: 'qq', conversationId: 'group-1', sourceMessageId: 'message-new' }
const createOperation = {
  action: 'create' as const,
  kind: 'task' as const,
  data: {
    title: '第三章作业', course: '人工智能', deadline: '2026-09-28',
    eventTime: null, location: '信息楼302', description: '提交至学习通',
  },
}
const updateOperation = {
  action: 'update' as const, kind: 'task' as const,
  target: { title: '第三章作业' },
  changes: { deadline: '2026-09-30', location: null },
}
const cancelOperation = {
  action: 'cancel' as const, kind: 'task' as const,
  target: { title: '第三章作业' },
}

function itemInput(): CreateCampusItemInput {
  return {
    kind: 'task', title: '第三章作业', course: '人工智能',
    deadline: '2026-09-28', eventTime: null, location: '信息楼302',
    description: '提交至学习通', source: 'original-source',
    conversationId: 'original-conversation', originSourceMessageId: 'original-message',
  }
}

function resolved(item: CampusItem): EntityResolution {
  return { status: 'resolved', item }
}

function failAuditWrites(db: DatabaseSync): void {
  db.exec(`
    CREATE TRIGGER fail_audit BEFORE INSERT ON campus_item_operations
    BEGIN SELECT RAISE(FAIL, 'audit failed'); END
  `)
}

test('create stores current provenance and an atomic CREATE audit with null beforeState', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const executor = createActionExecutor(db)
    const result = executor.execute({ operation: createOperation, provenance })
    assert.equal(result.status, 'created')
    if (result.status !== 'created') return
    assert.equal(result.item.source, provenance.source)
    assert.equal(result.item.conversationId, provenance.conversationId)
    assert.equal(result.item.originSourceMessageId, provenance.sourceMessageId)
    const items = createCampusItemRepository(db)
    const audits = createCampusItemOperationRepository(db)
    assert.deepEqual(items.findCampusItemById(result.item.id), result.item)
    const [audit] = audits.findCampusItemOperations(result.item.id)
    assert.equal(audit.action, 'create')
    assert.equal(audit.source, provenance.source)
    assert.equal(audit.sourceMessageId, provenance.sourceMessageId)
    assert.equal(audit.beforeState, null)
    assert.deepEqual(audit.afterState, toCampusItemStateSnapshot(result.item))
  } finally {
    db.close()
  }
})

test('none skips without changing either table or starting a mutation transaction', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const executor = createActionExecutor(db)
    assert.deepEqual(executor.execute({ operation: { action: 'none' }, provenance }), {
      status: 'skipped', reason: 'none',
    })
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM campus_items').get()?.count, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM campus_item_operations').get()?.count, 0)
    db.exec('BEGIN IMMEDIATE')
    db.exec('ROLLBACK')
  } finally {
    db.close()
  }
})

test('resolved update rereads by ID, applies three-state patch, and audits actual states', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const executor = createActionExecutor(db)
    const items = createCampusItemRepository(db)
    const original = items.createCampusItem(itemInput())
    const staleResolution = resolved({ ...original, title: 'stale title', source: 'wrong source' })
    const result = executor.execute({
      operation: updateOperation, resolution: staleResolution,
      provenance,
    })
    assert.equal(result.status, 'updated')
    if (result.status !== 'updated') return
    assert.equal(result.item.deadline, '2026-09-30')
    assert.equal(result.item.location, null)
    assert.equal(result.item.title, original.title)
    assert.equal(result.item.course, original.course)
    assert.equal(result.item.description, original.description)
    assert.equal(result.item.source, original.source)
    assert.equal(result.item.conversationId, original.conversationId)
    assert.equal(result.item.originSourceMessageId, original.originSourceMessageId)
    const [audit] = createCampusItemOperationRepository(db).findCampusItemOperations(original.id)
    assert.equal(audit.action, 'update')
    assert.equal(audit.source, provenance.source)
    assert.equal(audit.sourceMessageId, provenance.sourceMessageId)
    assert.deepEqual(audit.beforeState, toCampusItemStateSnapshot(original))
    assert.deepEqual(audit.afterState, toCampusItemStateSnapshot(result.item))
    assert.deepEqual(items.findCampusItemById(original.id), result.item)
  } finally {
    db.close()
  }
})

test('unchanged update skips without refreshing updatedAt or writing an audit', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const executor = createActionExecutor(db)
    const items = createCampusItemRepository(db)
    const original = items.createCampusItem(itemInput())
    db.prepare('UPDATE campus_items SET updated_at = ? WHERE id = ?')
      .run('2020-01-01 00:00:00', original.id)
    assert.deepEqual(executor.execute({
      operation: { ...updateOperation, changes: {
        title: original.title, deadline: original.deadline, eventTime: null,
      } },
      resolution: resolved(original), provenance,
    }), { status: 'skipped', reason: 'no_change' })
    assert.equal(items.findCampusItemById(original.id)?.updatedAt, '2020-01-01 00:00:00')
    assert.deepEqual(createCampusItemOperationRepository(db).findCampusItemOperations(original.id), [])
  } finally {
    db.close()
  }
})

test('update and cancel gate every unresolved status without mutation or audit', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const executor = createActionExecutor(db)
    const items = createCampusItemRepository(db)
    const original = items.createCampusItem(itemInput())
    const resolutions: EntityResolution[] = [
      { status: 'ambiguous', candidates: [original] },
      { status: 'not_found' },
      { status: 'insufficient_reference', candidates: [original] },
    ]
    for (const resolution of resolutions) {
      for (const operation of [updateOperation, cancelOperation]) {
        assert.deepEqual(executor.execute({ operation, resolution, provenance }), {
          status: 'skipped', reason: resolution.status,
        })
      }
    }
    assert.deepEqual(items.findCampusItemById(original.id), original)
    assert.deepEqual(createCampusItemOperationRepository(db).findCampusItemOperations(original.id), [])
  } finally {
    db.close()
  }
})

test('update and cancel require a resolution, and a disappeared ID is an error', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const executor = createActionExecutor(db)
    const items = createCampusItemRepository(db)
    const original = items.createCampusItem(itemInput())
    for (const operation of [updateOperation, cancelOperation]) {
      assert.throws(() => executor.execute({ operation, provenance }), /缺少 EntityResolution/)
      assert.throws(() => executor.execute({
        operation, resolution: resolved({ ...original, id: 999 }), provenance,
      }), /已解析的 CampusItem 999 不存在/)
    }
    assert.deepEqual(items.findCampusItemById(original.id), original)
  } finally {
    db.close()
  }
})

test('cancel stores before/after audit, preserves origin, and repeated cancel is no_change', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const executor = createActionExecutor(db)
    const items = createCampusItemRepository(db)
    const original = items.createCampusItem(itemInput())
    const result = executor.execute({ operation: cancelOperation, resolution: resolved(original), provenance })
    assert.equal(result.status, 'cancelled')
    if (result.status !== 'cancelled') return
    assert.equal(result.item.status, 'cancelled')
    assert.equal(result.item.source, original.source)
    assert.equal(result.item.conversationId, original.conversationId)
    assert.equal(result.item.originSourceMessageId, original.originSourceMessageId)
    const audits = createCampusItemOperationRepository(db)
    const [audit] = audits.findCampusItemOperations(original.id)
    assert.equal(audit.action, 'cancel')
    assert.equal(audit.source, provenance.source)
    assert.equal(audit.sourceMessageId, provenance.sourceMessageId)
    assert.deepEqual(audit.beforeState, toCampusItemStateSnapshot(original))
    assert.deepEqual(audit.afterState, toCampusItemStateSnapshot(result.item))
    assert.deepEqual(executor.execute({
      operation: cancelOperation, resolution: resolved(original), provenance,
    }), { status: 'skipped', reason: 'no_change' })
    assert.deepEqual(items.findCampusItemById(original.id), result.item)
    assert.equal(audits.findCampusItemOperations(original.id).length, 1)
  } finally {
    db.close()
  }
})

for (const action of ['create', 'update', 'cancel'] as const) {
  test(`${action} rolls back the CampusItem mutation when audit insert fails`, () => {
    const db = new DatabaseSync(':memory:')
    try {
      const executor = createActionExecutor(db)
      const items = createCampusItemRepository(db)
      const original = action === 'create' ? null : items.createCampusItem(itemInput())
      failAuditWrites(db)
      const operation = action === 'create' ? createOperation
        : action === 'update' ? updateOperation : cancelOperation
      assert.throws(() => executor.execute({
        operation,
        resolution: original === null ? undefined : resolved(original),
        provenance,
      }), /audit failed/)
      if (original === null) {
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM campus_items').get()?.count, 0)
      } else {
        assert.deepEqual(items.findCampusItemById(original.id), original)
      }
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM campus_item_operations').get()?.count, 0)
      db.exec('BEGIN IMMEDIATE')
      db.exec('ROLLBACK')
    } finally {
      db.close()
    }
  })
}
