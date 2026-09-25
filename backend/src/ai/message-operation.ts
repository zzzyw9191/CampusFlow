import { z } from 'zod'
import { campusItemKindSchema } from '../domain/campus-item.js'
import { campusItemReferenceSchema } from '../domain/campus-item-reference.js'
import { campusItemPatchSchema } from '../domain/campus-item-patch.js'

const entityDataSchema = z.object({
  title: z.string(),
  course: z.string().nullable(),
  deadline: z.string().nullable(),
  eventTime: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
}).strict()

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
    changes: campusItemPatchSchema,
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
export type MessageOperation = z.infer<typeof messageOperationSchema>
