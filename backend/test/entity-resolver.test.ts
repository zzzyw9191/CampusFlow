import assert from 'node:assert/strict'
import test from 'node:test'
import type { CampusItem } from '../src/domain/campus-item.js'
import type { CampusItemReference } from '../src/domain/campus-item-reference.js'
import { resolveEntity } from '../src/domain/entity-resolver.js'

function item(id: number, fields: Partial<CampusItem> = {}): CampusItem {
  return {
    id, kind: 'task', status: 'active', title: '第三章作业',
    course: null, deadline: null, eventTime: null, location: null,
    description: null, source: 'qq', conversationId: 'group-1',
    originSourceMessageId: null, createdAt: '2026-09-20',
    updatedAt: '2026-09-20', cancelledAt: null, ...fields,
  }
}

function expectResolved(reference: CampusItemReference, candidates: CampusItem[], expected: CampusItem): void {
  assert.deepEqual(resolveEntity(reference, candidates), { status: 'resolved', item: expected })
}

test('exact title, course, deadline, event time, and location can each identify a unique item', () => {
  const target = item(1, {
    title: '第三章作业', course: '人工智能导论', deadline: '2026-09-28',
    eventTime: '2026-09-27T14:00:00+08:00', location: '信息楼302',
  })
  const other = item(2, {
    title: '第四章作业', course: '概率论', deadline: '2026-09-29',
    eventTime: '2026-09-27T15:00:00+08:00', location: '信息楼303',
  })
  for (const reference of [
    { title: '第三章作业' }, { course: '人工智能导论' },
    { deadline: '2026-09-28' }, { eventTime: '2026-09-27T14:00:00+08:00' },
    { location: '信息楼302' },
  ]) expectResolved(reference, [other, target], target)
})

test('weak title needs another matching field', () => {
  const target = item(1, { title: '人工智能第三章作业', course: '人工智能导论' })
  expectResolved({ title: '第三章作业', course: '人工智能导论' }, [target], target)
  assert.deepEqual(resolveEntity({ title: '第三章作业' }, [target]), {
    status: 'insufficient_reference', candidates: [target],
  })
})

test('empty and blank references cannot resolve even one candidate', () => {
  const target = item(1)
  for (const reference of [{}, { title: '  ', course: '\t' }]) {
    assert.deepEqual(resolveEntity(reference, [target]), {
      status: 'insufficient_reference', candidates: [target],
    })
  }
})

test('multiple matches stay ambiguous regardless of input order or updatedAt', () => {
  const first = item(1, { updatedAt: '2026-09-25' })
  const second = item(2, { updatedAt: '2026-09-20' })
  const expected = { status: 'ambiguous', candidates: [first, second] }
  assert.deepEqual(resolveEntity({ title: '第三章作业' }, [first, second]), expected)
  assert.deepEqual(resolveEntity({ title: '第三章作业' }, [second, first]), expected)
})

test('clear reference with no match returns not_found', () => {
  assert.deepEqual(resolveEntity({ title: '期末考试' }, [item(1)]), { status: 'not_found' })
  assert.deepEqual(resolveEntity({ course: '人工智能导论' }, []), { status: 'not_found' })
})

test('explicit course and location conflicts exclude a candidate despite matching title', () => {
  const target = item(1, { course: '概率论', location: '信息楼302' })
  assert.deepEqual(resolveEntity({ title: '第三章作业', course: '人工智能导论' }, [target]), { status: 'not_found' })
  assert.deepEqual(resolveEntity({ title: '第三章作业', location: '信息楼303' }, [target]), { status: 'not_found' })
})

test('date-only reference matches the same calendar date at datetime precision', () => {
  const target = item(1, { deadline: '2026-09-28T23:59:00+08:00' })
  expectResolved({ deadline: '2026-09-28' }, [target], target)
})

test('full datetime requires the same instant and never matches a date-only candidate', () => {
  const target = item(1, { deadline: '2026-09-28T23:59:00+08:00' })
  const otherTime = item(2, { deadline: '2026-09-28T12:00:00+08:00' })
  const dateOnly = item(3, { deadline: '2026-09-28' })
  expectResolved({ deadline: '2026-09-28T15:59:00Z' }, [otherTime, dateOnly, target], target)
  assert.deepEqual(resolveEntity({ deadline: '2026-09-28T23:58:00+08:00' }, [target, dateOnly]), { status: 'not_found' })
})

test('a null candidate field cannot satisfy an explicit reference field', () => {
  const target = item(1)
  for (const reference of [
    { course: '人工智能导论' }, { location: '信息楼302' },
    { deadline: '2026-09-28' }, { eventTime: '2026-09-28' },
  ]) assert.deepEqual(resolveEntity(reference, [target]), { status: 'not_found' })
})

test('title normalization supports NFKC, spaces, and case folding', () => {
  const target = item(1, { title: 'AI 第三章 作业' })
  expectResolved({ title: '  ａｉ   第三章\t作业  ' }, [target], target)
})

test('course and location require normalized equality rather than containment', () => {
  const target = item(1, { course: '人工智能导论', location: '信息楼302' })
  assert.deepEqual(resolveEntity({ course: '人工智能' }, [target]), { status: 'not_found' })
  assert.deepEqual(resolveEntity({ location: '信息楼' }, [target]), { status: 'not_found' })
})
