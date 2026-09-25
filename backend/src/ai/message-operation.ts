import { z } from 'zod'
import { campusItemKindSchema } from '../domain/campus-item.js'
import { campusItemReferenceSchema } from '../domain/campus-item-reference.js'

const entityDataSchema = z.object({
  title: z.string(),
  course: z.string().nullable(),
  deadline: z.string().nullable(),
  eventTime: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
}).strict()

const entityPatchSchema = z.object({
  title: z.string().nullable().optional(),
  course: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  eventTime: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0 && Object.values(value).every((field) => field !== undefined),
  'changes 至少需要一个有效修改字段',
)

export const messageOperationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    kind: campusItemKindSchema,
    data: entityDataSchema,
  }).strict(),
  z.object({
    action: z.literal('update'),
    kind: campusItemKindSchema,
    target: campusItemReferenceSchema,
    changes: entityPatchSchema,
  }).strict(),
  z.object({
    action: z.literal('cancel'),
    kind: campusItemKindSchema,
    target: campusItemReferenceSchema,
  }).strict(),
  z.object({ action: z.literal('none') }).strict(),
])

export type TrackableKind = z.infer<typeof campusItemKindSchema>
export type EntityData = z.infer<typeof entityDataSchema>
export type EntityPatch = z.infer<typeof entityPatchSchema>
export type MessageOperation = z.infer<typeof messageOperationSchema>
