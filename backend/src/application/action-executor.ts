import type { DatabaseSync } from 'node:sqlite'
import type { MessageOperation } from '../ai/message-operation.js'
import { createCampusItemOperationRepository } from '../data/campus-item-operation-repository.js'
import { createCampusItemRepository } from '../data/campus-item-repository.js'
import type { CampusItem, CreateCampusItemInput } from '../domain/campus-item.js'
import { toCampusItemStateSnapshot, type CampusItemStateSnapshot } from '../domain/campus-item-operation.js'
import { campusItemPatchSchema, type CampusItemPatch } from '../domain/campus-item-patch.js'
import type { EntityResolution } from '../domain/entity-resolver.js'

export type ActionExecutionInput = {
  operation: MessageOperation
  resolution?: EntityResolution
  provenance: {
    source: string
    conversationId: string | null
    sourceMessageId: string
  }
}

export type ActionExecutionResult =
  | { status: 'created'; item: CampusItem }
  | { status: 'updated'; item: CampusItem }
  | { status: 'cancelled'; item: CampusItem }
  | {
      status: 'skipped'
      reason: 'none' | 'ambiguous' | 'not_found' | 'insufficient_reference' | 'no_change'
    }

function patchChangesState(state: CampusItemStateSnapshot, patch: CampusItemPatch): boolean {
  return Object.entries(patch).some(([field, value]) =>
    state[field as keyof CampusItemStateSnapshot] !== value)
}

export function createActionExecutor(db: DatabaseSync) {
  const items = createCampusItemRepository(db)
  const operations = createCampusItemOperationRepository(db)

  function inTransaction<T>(work: () => T): T {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      db.exec('COMMIT')
      return result
    } catch (error) {
      try {
        db.exec('ROLLBACK')
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'CampusItem 事务及回滚均失败')
      }
      throw error
    }
  }

  return {
    execute(input: ActionExecutionInput): ActionExecutionResult {
      const { operation, provenance } = input
      if (operation.action === 'none') return { status: 'skipped', reason: 'none' }

      if (operation.action === 'create') {
        return inTransaction(() => {
          const createInput: CreateCampusItemInput = {
            kind: operation.kind,
            ...operation.data,
            source: provenance.source,
            conversationId: provenance.conversationId,
            originSourceMessageId: provenance.sourceMessageId,
          }
          const item = items.createCampusItem(createInput)
          operations.recordCampusItemOperation({
            campusItemId: item.id,
            action: 'create',
            source: provenance.source,
            sourceMessageId: provenance.sourceMessageId,
            beforeState: null,
            afterState: toCampusItemStateSnapshot(item),
          })
          return { status: 'created', item }
        })
      }

      const resolution = input.resolution
      if (resolution === undefined) throw new Error(`${operation.action} 缺少 EntityResolution`)
      if (resolution.status !== 'resolved') {
        return { status: 'skipped', reason: resolution.status }
      }

      return inTransaction(() => {
        const id = resolution.item.id
        const currentItem = items.findCampusItemById(id)
        if (currentItem === null) throw new Error(`已解析的 CampusItem ${id} 不存在`)
        const beforeState = toCampusItemStateSnapshot(currentItem)

        if (operation.action === 'update') {
          const patch = campusItemPatchSchema.parse(operation.changes)
          if (!patchChangesState(beforeState, patch)) {
            return { status: 'skipped', reason: 'no_change' }
          }
          const item = items.updateCampusItem(id, patch)
          if (item === null) throw new Error(`CampusItem ${id} 更新后无法读取`)
          operations.recordCampusItemOperation({
            campusItemId: id,
            action: 'update',
            source: provenance.source,
            sourceMessageId: provenance.sourceMessageId,
            beforeState,
            afterState: toCampusItemStateSnapshot(item),
          })
          return { status: 'updated', item }
        }

        if (currentItem.status === 'cancelled') {
          return { status: 'skipped', reason: 'no_change' }
        }
        const item = items.cancelCampusItem(id)
        if (item === null) throw new Error(`CampusItem ${id} 取消后无法读取`)
        operations.recordCampusItemOperation({
          campusItemId: id,
          action: 'cancel',
          source: provenance.source,
          sourceMessageId: provenance.sourceMessageId,
          beforeState,
          afterState: toCampusItemStateSnapshot(item),
        })
        return { status: 'cancelled', item }
      })
    },
  }
}
