import { z } from 'zod'

export const TASK_INTENT_LIMITS = Object.freeze({
  messageUtf8Bytes: 8_192,
  messageUnicodeCodePoints: 4_096,
  currentContextMessages: 16,
  currentContextUtf8Bytes: 32_768,
  currentContextTtlHours: 24,
  httpJsonBodyBytes: 64 * 1_024,
  aiRequestTimeoutMs: 30_000,
  newIntentsPerOwnerPerWindow: 10,
  continuationOrStatusPerOwnerPerWindow: 30,
  rateLimitWindowSeconds: 60,
} as const)

export function countUtf8Bytes(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

export function countUnicodeCodePoints(value: string): number {
  return Array.from(value).length
}

const uuidSchema = z.uuid()
const revisionSchema = z.number().int()

export const taskMessageSchema = z
  .string()
  .refine((value) => countUnicodeCodePoints(value.trim()) >= 1, {
    error: 'Message must not be empty after trim',
  })
  .refine(
    (value) =>
      countUnicodeCodePoints(value.trim()) <=
      TASK_INTENT_LIMITS.messageUnicodeCodePoints,
    { error: 'Message exceeds the Unicode code-point limit' },
  )
  .refine(
    (value) =>
      countUtf8Bytes(value.trim()) <= TASK_INTENT_LIMITS.messageUtf8Bytes,
    { error: 'Message exceeds the UTF-8 byte limit' },
  )

export const taskIntentRequestSchema = z.strictObject({
  intent_id: uuidSchema,
  interaction_id: uuidSchema,
  message: taskMessageSchema,
  context_revision: revisionSchema,
  additional_after_unknown_of: uuidSchema.optional(),
})

const clarificationAnswerSchema = z.strictObject({
  kind: z.literal('clarification_answer'),
  text: z.string().trim().min(1),
})

const scopeDecisionSchema = z.strictObject({
  kind: z.literal('scope_decision'),
  value: z.literal('supported_only'),
})

export const taskOperationContinuationRequestSchema = z.strictObject({
  operation_id: uuidSchema,
  expected_revision: revisionSchema,
  continuation_id: uuidSchema,
  answer: z.discriminatedUnion('kind', [
    clarificationAnswerSchema,
    scopeDecisionSchema,
  ]),
})

export const taskPresentationAcknowledgementRequestSchema = z.strictObject({
  operation_id: uuidSchema,
  expected_revision: revisionSchema,
  presentation_id: uuidSchema,
  acknowledgement_id: uuidSchema,
})

const nonEmptyTextSchema = z.string().trim().min(1)

export const interpretationSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('create_task'),
    normalized_text: nonEmptyTextSchema,
  }),
  z.strictObject({
    kind: z.literal('clarification'),
    question: nonEmptyTextSchema,
    ambiguity_code: nonEmptyTextSchema,
  }),
  z.strictObject({
    kind: z.literal('mixed'),
    normalized_text: nonEmptyTextSchema,
    unsupported_summary: nonEmptyTextSchema,
    scope_question: nonEmptyTextSchema,
  }),
  z.strictObject({
    kind: z.literal('unsupported'),
    capability_code: nonEmptyTextSchema,
  }),
])

export const operationStateSchema = z.enum([
  'received',
  'clarification_required',
  'scope_decision_required',
  'unsupported',
  'ready_to_present',
  'presented',
  'creating',
  'committed_pending_verification',
  'success',
  'failure',
  'unknown',
])

export const resultKindSchema = z.enum(['success', 'failure', 'unknown'])

export const safeReasonCodeSchema = z.enum([
  'invalid_input',
  'unsupported',
  'storage_rejected',
  'identity_unavailable',
  'result_unverifiable',
])

export type TaskIntentRequest = z.infer<typeof taskIntentRequestSchema>
export type TaskOperationContinuationRequest = z.infer<
  typeof taskOperationContinuationRequestSchema
>
export type TaskPresentationAcknowledgementRequest = z.infer<
  typeof taskPresentationAcknowledgementRequestSchema
>
export type Interpretation = z.infer<typeof interpretationSchema>
export type OperationState = z.infer<typeof operationStateSchema>
export type ResultKind = z.infer<typeof resultKindSchema>
export type SafeReasonCode = z.infer<typeof safeReasonCodeSchema>
