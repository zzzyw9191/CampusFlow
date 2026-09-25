import { z } from 'zod'

export const campusItemReferenceSchema = z.object({
  title: z.string().optional(),
  course: z.string().optional(),
  deadline: z.string().optional(),
  eventTime: z.string().optional(),
  location: z.string().optional(),
}).strict().refine(
  (value) => Object.keys(value).length > 0 && Object.values(value).every((field) => field !== undefined),
  'target 至少需要一个有效识别字段',
)

export type CampusItemReference = z.infer<typeof campusItemReferenceSchema>
