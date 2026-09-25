import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { createCampusItemRepository } from '../src/data/campus-item-repository.js'
import type { CreateCampusItemInput } from '../src/domain/campus-item.js'

function input(kind: CreateCampusItemInput['kind']): CreateCampusItemInput {
  return {
    kind,
    title: `${kind} 标题`,
    course: null,
    deadline: null,
    eventTime: null,
    location: null,
    description: null,
    source: 'qq',
    conversationId: 'group-1',
    originSourceMessageId: 'message-1',
  }
}

test('creates task, event and notification and reads their full current state by ID', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const repository = createCampusItemRepository(db)
    const task = repository.createCampusItem({
      ...input('task'),
      course: '人工智能',
      deadline: '2026-09-28',
      description: '提交至学习通',
    })
    const event = repository.createCampusItem({
      ...input('event'),
      eventTime: '2026-09-28T23:59:00+08:00',
      location: '信息楼302',
    })
    const notification = repository.createCampusItem({
      ...input('notification'),
      conversationId: null,
      originSourceMessageId: null,
    })

    for (const item of [task, event, notification]) {
      assert.ok(Number.isSafeInteger(item.id) && item.id > 0)
      assert.equal(item.status, 'active')
      assert.equal(item.cancelledAt, null)
      assert.match(item.createdAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
      assert.equal(item.updatedAt, item.createdAt)
      assert.deepEqual(repository.findCampusItemById(item.id), item)
    }
    assert.equal(task.deadline, '2026-09-28')
    assert.equal(task.eventTime, null)
    assert.equal(task.course, '人工智能')
    assert.equal(task.description, '提交至学习通')
    assert.equal(event.eventTime, '2026-09-28T23:59:00+08:00')
    assert.equal(event.location, '信息楼302')
    assert.equal(notification.course, null)
    assert.equal(notification.conversationId, null)
    assert.equal(notification.originSourceMessageId, null)
    assert.equal(repository.findCampusItemById(999), null)
  } finally {
    db.close()
  }
})

test('SQLite rejects invalid kind and status without exposing status in create input', () => {
  const db = new DatabaseSync(':memory:')
  try {
    createCampusItemRepository(db)
    const insert = db.prepare(`
      INSERT INTO campus_items (kind, status, title, source)
      VALUES (?, ?, ?, ?)
    `)

    assert.throws(() => insert.run('irrelevant', 'active', '无效', 'qq'), /CHECK constraint failed/)
    assert.throws(() => insert.run('task', 'unknown', '无效', 'qq'), /CHECK constraint failed/)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM campus_items').get()?.count, 0)
  } finally {
    db.close()
  }
})

test('repository rejects a malformed database row', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const repository = createCampusItemRepository(db)
    const item = repository.createCampusItem(input('task'))
    db.prepare('UPDATE campus_items SET course = ? WHERE id = ?').run(Buffer.from('bad'), item.id)

    assert.throws(() => repository.findCampusItemById(item.id), /CampusItem 数据库行格式不合法/)
  } finally {
    db.close()
  }
})

test('active item query filters kind, source, conversation and status, then sorts before LIMIT', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const repository = createCampusItemRepository(db)
    const first = repository.createCampusItem({ ...input('task'), title: 'first' })
    const second = repository.createCampusItem({ ...input('task'), title: 'second' })
    const third = repository.createCampusItem({ ...input('task'), title: 'third' })
    const cancelled = repository.createCampusItem({ ...input('task'), title: 'cancelled' })
    repository.createCampusItem({ ...input('event'), title: 'wrong kind' })
    repository.createCampusItem({ ...input('task'), source: 'other', title: 'wrong source' })
    repository.createCampusItem({ ...input('task'), conversationId: 'group-2', title: 'wrong group' })
    repository.createCampusItem({ ...input('task'), conversationId: null, title: 'null group' })

    const setUpdatedAt = db.prepare('UPDATE campus_items SET updated_at = ? WHERE id = ?')
    setUpdatedAt.run('2026-09-25 09:00:00', first.id)
    setUpdatedAt.run('2026-09-26 10:00:00', second.id)
    setUpdatedAt.run('2026-09-26 10:00:00', third.id)
    db.prepare("UPDATE campus_items SET status = 'cancelled' WHERE id = ?").run(cancelled.id)

    const options = { kind: 'task' as const, source: 'qq', conversationId: 'group-1' }
    const results = repository.findActiveCampusItems({ ...options, limit: 2 })
    assert.deepEqual(results.map((item) => item.id), [third.id, second.id])
    assert.deepEqual(results, [third.id, second.id].map((id) => repository.findCampusItemById(id)))
    assert.deepEqual(
      repository.findActiveCampusItems({ ...options, limit: 10 }).map((item) => item.id),
      [third.id, second.id, first.id],
    )
    assert.deepEqual(
      repository.findActiveCampusItems({ ...options, kind: 'event', limit: 10 })
        .map((item) => item.title),
      ['wrong kind'],
    )
    assert.deepEqual(
      repository.findActiveCampusItems({ ...options, source: 'other', limit: 10 })
        .map((item) => item.title),
      ['wrong source'],
    )
    assert.deepEqual(
      repository.findActiveCampusItems({ ...options, conversationId: 'group-2', limit: 10 })
        .map((item) => item.title),
      ['wrong group'],
    )
  } finally {
    db.close()
  }
})

test('null conversation matches only NULL and invalid limits are rejected', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const repository = createCampusItemRepository(db)
    const nullConversation = repository.createCampusItem({
      ...input('notification'), conversationId: null,
    })
    repository.createCampusItem({ ...input('notification'), conversationId: 'group-1' })
    const options = { kind: 'notification' as const, source: 'qq', conversationId: null }

    assert.deepEqual(
      repository.findActiveCampusItems({ ...options, limit: 10 }),
      [nullConversation],
    )
    for (const limit of [0, -1, Number.NaN, 1.5, Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(
        () => repository.findActiveCampusItems({ ...options, limit }),
        /查询数量必须是正安全整数/,
      )
    }
  } finally {
    db.close()
  }
})

test('active item query maps rows through the same validation as findById', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const repository = createCampusItemRepository(db)
    const item = repository.createCampusItem(input('task'))
    db.prepare('UPDATE campus_items SET course = ? WHERE id = ?').run(Buffer.from('bad'), item.id)

    assert.throws(
      () => repository.findActiveCampusItems({
        kind: 'task', source: 'qq', conversationId: 'group-1', limit: 1,
      }),
      /CampusItem 数据库行格式不合法/,
    )
  } finally {
    db.close()
  }
})
