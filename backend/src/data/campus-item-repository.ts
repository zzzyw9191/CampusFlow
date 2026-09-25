import type { DatabaseSync } from 'node:sqlite'
import {
  campusItemKindSchema,
  campusItemStatusSchema,
  type CampusItem,
  type CampusItemKind,
  type CreateCampusItemInput,
} from '../domain/campus-item.js'

export type FindActiveCampusItemsOptions = {
  kind: CampusItemKind
  source: string
  conversationId: string | null
  limit: number
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function toCampusItem(row: Record<string, unknown>): CampusItem {
  const kind = campusItemKindSchema.safeParse(row.kind)
  const status = campusItemStatusSchema.safeParse(row.status)

  if (
    typeof row.id !== 'number' ||
    !Number.isSafeInteger(row.id) ||
    !kind.success ||
    !status.success ||
    typeof row.title !== 'string' ||
    !isNullableString(row.course) ||
    !isNullableString(row.deadline) ||
    !isNullableString(row.eventTime) ||
    !isNullableString(row.location) ||
    !isNullableString(row.description) ||
    typeof row.source !== 'string' ||
    !isNullableString(row.conversationId) ||
    !isNullableString(row.originSourceMessageId) ||
    typeof row.createdAt !== 'string' ||
    typeof row.updatedAt !== 'string' ||
    !isNullableString(row.cancelledAt)
  ) {
    throw new Error('CampusItem 数据库行格式不合法')
  }

  return {
    id: row.id,
    kind: kind.data,
    status: status.data,
    title: row.title,
    course: row.course,
    deadline: row.deadline,
    eventTime: row.eventTime,
    location: row.location,
    description: row.description,
    source: row.source,
    conversationId: row.conversationId,
    originSourceMessageId: row.originSourceMessageId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cancelledAt: row.cancelledAt,
  }
}

export function createCampusItemRepository(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campus_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('notification', 'task', 'event')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
      title TEXT NOT NULL,
      course TEXT,
      deadline TEXT,
      event_time TEXT,
      location TEXT,
      description TEXT,
      source TEXT NOT NULL,
      conversation_id TEXT,
      origin_source_message_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cancelled_at TEXT
    )
  `)

  const insertCampusItem = db.prepare(`
    INSERT INTO campus_items (
      kind, title, course, deadline, event_time, location, description,
      source, conversation_id, origin_source_message_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const selectCampusItemById = db.prepare(`
    SELECT
      id, kind, status, title, course, deadline,
      event_time AS eventTime, location, description,
      source, conversation_id AS conversationId,
      origin_source_message_id AS originSourceMessageId,
      created_at AS createdAt, updated_at AS updatedAt,
      cancelled_at AS cancelledAt
    FROM campus_items
    WHERE id = ?
  `)

  const selectActiveCampusItems = db.prepare(`
    SELECT
      id, kind, status, title, course, deadline,
      event_time AS eventTime, location, description,
      source, conversation_id AS conversationId,
      origin_source_message_id AS originSourceMessageId,
      created_at AS createdAt, updated_at AS updatedAt,
      cancelled_at AS cancelledAt
    FROM campus_items
    WHERE kind = ?
      AND source = ?
      AND status = 'active'
      AND ((? IS NULL AND conversation_id IS NULL) OR conversation_id = ?)
    ORDER BY updated_at DESC, id DESC
    LIMIT ?
  `)

  function findCampusItemById(id: number): CampusItem | null {
    const row = selectCampusItemById.get(id)
    return row === undefined ? null : toCampusItem(row)
  }

  return {
    createCampusItem(input: CreateCampusItemInput): CampusItem {
      const result = insertCampusItem.run(
        input.kind,
        input.title,
        input.course,
        input.deadline,
        input.eventTime,
        input.location,
        input.description,
        input.source,
        input.conversationId,
        input.originSourceMessageId,
      )

      const item = findCampusItemById(Number(result.lastInsertRowid))
      if (item === null) throw new Error('刚创建的 CampusItem 无法读取')
      return item
    },
    findCampusItemById,
    findActiveCampusItems(options: FindActiveCampusItemsOptions): CampusItem[] {
      if (!Number.isSafeInteger(options.limit) || options.limit <= 0) {
        throw new RangeError('查询数量必须是正安全整数')
      }

      return selectActiveCampusItems.all(
        options.kind,
        options.source,
        options.conversationId,
        options.conversationId,
        options.limit,
      ).map(toCampusItem)
    },
  }
}
