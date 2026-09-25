import { z } from 'zod'
import {
  campusItemKindSchema,
  campusItemStatusSchema,
  type CampusItem,
} from './campus-item.js'

export const campusItemOperationActionSchema = z.enum(['create', 'update', 'cancel'])

export const campusItemStateSnapshotSchema = z.object({
  kind: campusItemKindSchema,
  status: campusItemStatusSchema,
  title: z.string(),
  course: z.string().nullable(),
  deadline: z.string().nullable(),
  eventTime: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
}).strict()

export const createCampusItemOperationInputSchema = z.object({
  campusItemId: z.number().int().positive(),
  action: campusItemOperationActionSchema,
  source: z.string(),
  sourceMessageId: z.string(),
  beforeState: campusItemStateSnapshotSchema.nullable(),
  afterState: campusItemStateSnapshotSchema,
}).strict()

export type CampusItemOperationAction = z.infer<typeof campusItemOperationActionSchema>
export type CampusItemStateSnapshot = z.infer<typeof campusItemStateSnapshotSchema>
export type CreateCampusItemOperationInput = z.infer<typeof createCampusItemOperationInputSchema>
export type CampusItemOperation = CreateCampusItemOperationInput & {
  id: number
  createdAt: string
}

export function toCampusItemStateSnapshot(item: CampusItem): CampusItemStateSnapshot {
  return {
    kind: item.kind,
    status: item.status,
    title: item.title,
    course: item.course,
    deadline: item.deadline,
    eventTime: item.eventTime,
    location: item.location,
    description: item.description,
  }
}
