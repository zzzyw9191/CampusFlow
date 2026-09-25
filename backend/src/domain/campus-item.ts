import { z } from 'zod'

export const campusItemKindSchema = z.enum(['notification', 'task', 'event'])
export const campusItemStatusSchema = z.enum(['active', 'cancelled'])

export type CampusItemKind = z.infer<typeof campusItemKindSchema>
export type CampusItemStatus = z.infer<typeof campusItemStatusSchema>

export type CampusItem = {
  id: number
  kind: CampusItemKind
  status: CampusItemStatus
  title: string
  course: string | null
  deadline: string | null
  eventTime: string | null
  location: string | null
  description: string | null
  source: string
  conversationId: string | null
  originSourceMessageId: string | null
  createdAt: string
  updatedAt: string
  cancelledAt: string | null
}

export type CreateCampusItemInput = Pick<
  CampusItem,
  | 'kind'
  | 'title'
  | 'course'
  | 'deadline'
  | 'eventTime'
  | 'location'
  | 'description'
  | 'source'
  | 'conversationId'
  | 'originSourceMessageId'
>
