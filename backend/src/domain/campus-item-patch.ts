import { z } from 'zod'

export const campusItemPatchSchema = z.object({
  title: z.string().optional(),
  course: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  eventTime: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0 && Object.values(value).every((field) => field !== undefined),
  'changes 至少需要一个有效修改字段',
)

export type CampusItemPatch = z.infer<typeof campusItemPatchSchema>
