import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import {
  campusItemOperationActionSchema,
  campusItemStateSnapshotSchema,
  createCampusItemOperationInputSchema,
  type CampusItemOperation,
  type CampusItemStateSnapshot,
  type CreateCampusItemOperationInput,
} from '../domain/campus-item-operation.js'

const operationRowSchema = z.object({
  id: z.number().int().positive(),
  campusItemId: z.number().int().positive(),
  action: campusItemOperationActionSchema,
  source: z.string(),
  sourceMessageId: z.string(),
  beforeState: z.string().nullable(),
  afterState: z.string(),
  createdAt: z.string(),
}).strict()

function parseSnapshot(value: string, column: string): CampusItemStateSnapshot {
  try {
    return campusItemStateSnapshotSchema.parse(JSON.parse(value))
  } catch {
    throw new Error(`CampusItemOperation ${column} JSON 或 Snapshot 格式不合法`)
  }
}

function toCampusItemOperation(row: Record<string, unknown>): CampusItemOperation {
  const parsed = operationRowSchema.safeParse(row)
  if (!parsed.success) throw new Error('CampusItemOperation 数据库行格式不合法')
  const value = parsed.data
  return {
    id: value.id,
    campusItemId: value.campusItemId,
    action: value.action,
    source: value.source,
    sourceMessageId: value.sourceMessageId,
    beforeState: value.beforeState === null ? null : parseSnapshot(value.beforeState, 'before_state'),
    afterState: parseSnapshot(value.afterState, 'after_state'),
    createdAt: value.createdAt,
  }
}

export function createCampusItemOperationRepository(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS campus_item_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campus_item_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      source TEXT NOT NULL,
      source_message_id TEXT NOT NULL,
      before_state TEXT,
      after_state TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(action IN ('create', 'update', 'cancel')),
      FOREIGN KEY (campus_item_id) REFERENCES campus_items(id)
    )
  `)
  const duplicate = db.prepare(`
    SELECT 1 FROM campus_item_operations
    GROUP BY source, source_message_id
    HAVING COUNT(*) > 1
    LIMIT 1
  `).get()
  if (duplicate !== undefined) {
    throw new Error('CampusItemOperation 历史存在重复 source + source_message_id，无法创建唯一索引')
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS campus_item_operations_source_message_unique
    ON campus_item_operations(source, source_message_id)
  `)

  const insertOperation = db.prepare(`
    INSERT INTO campus_item_operations (
      campus_item_id, action, source, source_message_id, before_state, after_state
    ) VALUES (?, ?, ?, ?, ?, ?)
  `)
  const selectOperations = db.prepare(`
    SELECT id, campus_item_id AS campusItemId, action, source,
      source_message_id AS sourceMessageId,
      before_state AS beforeState, after_state AS afterState,
      created_at AS createdAt
    FROM campus_item_operations
    WHERE campus_item_id = ?
    ORDER BY id ASC
  `)
  const selectOperationById = db.prepare(`
    SELECT id, campus_item_id AS campusItemId, action, source,
      source_message_id AS sourceMessageId,
      before_state AS beforeState, after_state AS afterState,
      created_at AS createdAt
    FROM campus_item_operations
    WHERE id = ?
  `)
  const selectOperationBySourceMessage = db.prepare(`
    SELECT id, campus_item_id AS campusItemId, action, source,
      source_message_id AS sourceMessageId,
      before_state AS beforeState, after_state AS afterState,
      created_at AS createdAt
    FROM campus_item_operations
    WHERE source = ? AND source_message_id = ?
  `)

  return {
    recordCampusItemOperation(input: CreateCampusItemOperationInput): CampusItemOperation {
      const operation = createCampusItemOperationInputSchema.parse(input)
      const result = insertOperation.run(
        operation.campusItemId,
        operation.action,
        operation.source,
        operation.sourceMessageId,
        operation.beforeState === null ? null : JSON.stringify(operation.beforeState),
        JSON.stringify(operation.afterState),
      )
      const row = selectOperationById.get(Number(result.lastInsertRowid))
      if (row === undefined) throw new Error('刚创建的 CampusItemOperation 无法读取')
      return toCampusItemOperation(row)
    },
    findCampusItemOperations(campusItemId: number): CampusItemOperation[] {
      return selectOperations.all(campusItemId).map(toCampusItemOperation)
    },
    findCampusItemOperationBySourceMessage(
      source: string,
      sourceMessageId: string,
    ): CampusItemOperation | null {
      const row = selectOperationBySourceMessage.get(source, sourceMessageId)
      return row === undefined ? null : toCampusItemOperation(row)
    },
  }
}
