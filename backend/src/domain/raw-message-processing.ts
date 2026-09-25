import { z } from 'zod'

export const rawMessageProcessingStatusSchema = z.enum([
  'pending', 'completed', 'needs_review', 'failed',
])
export const completedProcessingOutcomeSchema = z.enum([
  'created', 'updated', 'cancelled', 'none', 'no_change',
])
export const reviewProcessingOutcomeSchema = z.enum([
  'ambiguous', 'not_found', 'insufficient_reference',
])

export const rawMessageProcessingStateSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('pending'), outcome: z.null(),
    processedAt: z.null(), lastError: z.null(),
  }).strict(),
  z.object({
    status: z.literal('completed'), outcome: completedProcessingOutcomeSchema,
    processedAt: z.string(), lastError: z.null(),
  }).strict(),
  z.object({
    status: z.literal('needs_review'), outcome: reviewProcessingOutcomeSchema,
    processedAt: z.string(), lastError: z.null(),
  }).strict(),
  z.object({
    status: z.literal('failed'), outcome: z.null(),
    processedAt: z.string(), lastError: z.string().trim().min(1),
  }).strict(),
])

export const rawMessageProcessingUpdateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('completed'), outcome: completedProcessingOutcomeSchema }).strict(),
  z.object({ status: z.literal('needs_review'), outcome: reviewProcessingOutcomeSchema }).strict(),
  z.object({ status: z.literal('failed'), lastError: z.string().trim().min(1) }).strict(),
])

export type RawMessageProcessingStatus = z.infer<typeof rawMessageProcessingStatusSchema>
export type CompletedProcessingOutcome = z.infer<typeof completedProcessingOutcomeSchema>
export type ReviewProcessingOutcome = z.infer<typeof reviewProcessingOutcomeSchema>
export type RawMessageProcessingState = z.infer<typeof rawMessageProcessingStateSchema>
export type RawMessageProcessingUpdate = z.infer<typeof rawMessageProcessingUpdateSchema>
