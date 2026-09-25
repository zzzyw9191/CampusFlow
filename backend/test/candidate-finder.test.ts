import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { createCampusItemRepository } from '../src/data/campus-item-repository.js'
import { CandidateFinder, DEFAULT_CANDIDATE_LIMIT } from '../src/domain/candidate-finder.js'
import type { CreateCampusItemInput } from '../src/domain/campus-item.js'

function input(title: string): CreateCampusItemInput {
  return {
    kind: 'task',
    title,
    course: null,
    deadline: null,
    eventTime: null,
    location: null,
    description: null,
    source: 'qq',
    conversationId: 'group-1',
    originSourceMessageId: null,
  }
}

test('CandidateFinder returns recent active items in the exact kind, source and conversation scope', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const repository = createCampusItemRepository(db)
    const older = repository.createCampusItem({
      ...input('完全不同的标题'), course: '数学', deadline: '2026-09-28',
    })
    const newer = repository.createCampusItem({
      ...input('作业'), course: '人工智能', deadline: '2026-10-02',
    })
    const cancelled = repository.createCampusItem(input('已取消'))
    repository.createCampusItem({ ...input('别的类型'), kind: 'event' })
    repository.createCampusItem({ ...input('别的来源'), source: 'other' })
    repository.createCampusItem({ ...input('别的会话'), conversationId: 'group-2' })
    repository.createCampusItem({ ...input('空会话'), conversationId: null })

    db.prepare('UPDATE campus_items SET updated_at = ? WHERE id = ?')
      .run('2026-09-24 09:00:00', older.id)
    db.prepare('UPDATE campus_items SET updated_at = ? WHERE id = ?')
      .run('2026-09-25 10:00:00', newer.id)
    db.prepare("UPDATE campus_items SET status = 'cancelled' WHERE id = ?").run(cancelled.id)

    const candidates = new CandidateFinder(repository).find({
      kind: 'task', source: 'qq', conversationId: 'group-1',
    })

    assert.deepEqual(candidates.map((item) => item.id), [newer.id, older.id])
    assert.deepEqual(candidates, [newer.id, older.id].map((id) => repository.findCampusItemById(id)))
  } finally {
    db.close()
  }
})

test('CandidateFinder treats null conversation as only the NULL scope', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const repository = createCampusItemRepository(db)
    const nullScope = repository.createCampusItem({ ...input('空会话'), conversationId: null })
    repository.createCampusItem(input('普通群'))

    assert.deepEqual(new CandidateFinder(repository).find({
      kind: 'task', source: 'qq', conversationId: null,
    }), [nullScope])
  } finally {
    db.close()
  }
})

test('CandidateFinder applies the default and configurable candidate limits', () => {
  const db = new DatabaseSync(':memory:')
  try {
    const repository = createCampusItemRepository(db)
    const ids: number[] = []
    for (let index = 0; index <= DEFAULT_CANDIDATE_LIMIT; index++) {
      ids.push(repository.createCampusItem(input(`候选 ${index}`)).id)
    }
    db.prepare('UPDATE campus_items SET updated_at = ?').run('2026-09-25 10:00:00')
    const scope = { kind: 'task' as const, source: 'qq', conversationId: 'group-1' }

    assert.deepEqual(
      new CandidateFinder(repository).find(scope).map((item) => item.id),
      ids.slice(1).reverse(),
    )
    assert.deepEqual(
      new CandidateFinder(repository, 3).find(scope).map((item) => item.id),
      ids.slice(-3).reverse(),
    )
  } finally {
    db.close()
  }
})
