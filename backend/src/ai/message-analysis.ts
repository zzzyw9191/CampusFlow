import { z } from 'zod'

export type MessageKind = 'notification' | 'task' | 'event' | 'irrelevant'

export interface MessageAnalysis {
  kind: MessageKind
  title: string
  course: string | null
  deadline: string | null
  eventTime: string | null
  location: string | null
  description: string | null
}

export const messageAnalysisSchema: z.ZodType<MessageAnalysis> = z.object({
  kind: z.enum(['notification', 'task', 'event', 'irrelevant']),
  title: z.string(),
  course: z.string().nullable(),
  deadline: z.string().nullable(),
  eventTime: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
})
