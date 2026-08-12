import { describe, expect, it } from 'vitest'

import {
  interpretationSchema,
  operationStateSchema,
  resultKindSchema,
  safeReasonCodeSchema,
  taskIntentRequestSchema,
  taskMessageSchema,
  taskOperationContinuationRequestSchema,
  taskPresentationAcknowledgementRequestSchema,
} from '../../src/contracts/task-intent'

const IDS = {
  intent: '019c5a4e-7d50-7000-8000-000000000001',
  interaction: '019c5a4e-7d50-7000-8000-000000000002',
  operation: '019c5a4e-7d50-7000-8000-000000000003',
  delivery: '019c5a4e-7d50-7000-8000-000000000004',
  presentation: '019c5a4e-7d50-7000-8000-000000000005',
} as const

const primaryRequest = {
  intent_id: IDS.intent,
  interaction_id: IDS.interaction,
  message: '  Купить молоко  ',
  context_revision: 0,
}

describe('TaskIntentRequest', () => {
  it('accepts only the approved primary envelope and preserves source text', () => {
    expect(taskIntentRequestSchema.parse(primaryRequest).message).toBe(
      primaryRequest.message,
    )
    expect(
      taskIntentRequestSchema.parse({
        ...primaryRequest,
        additional_after_unknown_of: IDS.operation,
      }).additional_after_unknown_of,
    ).toBe(IDS.operation)
  })

  it.each([
    ['malformed UUID', { ...primaryRequest, intent_id: 'not-a-uuid' }],
    ['owner_id', { ...primaryRequest, owner_id: IDS.intent }],
    ['operation_id', { ...primaryRequest, operation_id: IDS.operation }],
    [
      'clarification_answer',
      { ...primaryRequest, clarification_answer: 'Ответ' },
    ],
    ['scope_decision', { ...primaryRequest, scope_decision: 'supported_only' }],
    ['unknown field', { ...primaryRequest, priority: 'high' }],
  ])('rejects %s', (_name, input) => {
    expect(taskIntentRequestSchema.safeParse(input).success).toBe(false)
  })
})

describe('message boundaries', () => {
  it.each(['', '   ', '\n\t'])('rejects empty content after trim', (message) => {
    expect(taskMessageSchema.safeParse(message).success).toBe(false)
  })

  it('accepts one and exactly 4096 Unicode code points', () => {
    expect(taskMessageSchema.safeParse('🙂').success).toBe(true)
    expect(taskMessageSchema.safeParse('a'.repeat(4_096)).success).toBe(true)
  })

  it('rejects 4097 Unicode code points', () => {
    expect(taskMessageSchema.safeParse('a'.repeat(4_097)).success).toBe(false)
  })

  it('accepts exactly 8192 UTF-8 bytes and rejects more', () => {
    expect(taskMessageSchema.safeParse('é'.repeat(4_096)).success).toBe(true)
    expect(taskMessageSchema.safeParse('€'.repeat(2_730) + 'aa').success).toBe(
      true,
    )
    expect(taskMessageSchema.safeParse('€'.repeat(2_730) + 'aaa').success).toBe(
      false,
    )
  })
})

describe('TaskOperationContinuationRequest', () => {
  const base = {
    operation_id: IDS.operation,
    expected_revision: 7,
    continuation_id: IDS.delivery,
  }

  it('accepts exactly one clarification or supported-only decision', () => {
    expect(
      taskOperationContinuationRequestSchema.safeParse({
        ...base,
        answer: { kind: 'clarification_answer', text: 'Завтра' },
      }).success,
    ).toBe(true)
    expect(
      taskOperationContinuationRequestSchema.safeParse({
        ...base,
        answer: { kind: 'scope_decision', value: 'supported_only' },
      }).success,
    ).toBe(true)
  })

  it.each([
    ['invalid kind', { kind: 'confirmation', value: true }],
    ['invalid scope value', { kind: 'scope_decision', value: 'all' }],
    [
      'simultaneous shapes',
      {
        kind: 'clarification_answer',
        text: 'Ответ',
        value: 'supported_only',
      },
    ],
    ['empty clarification', { kind: 'clarification_answer', text: '  ' }],
  ])('rejects %s', (_name, answer) => {
    expect(
      taskOperationContinuationRequestSchema.safeParse({ ...base, answer })
        .success,
    ).toBe(false)
  })

  it('rejects owner and unknown envelope fields', () => {
    expect(
      taskOperationContinuationRequestSchema.safeParse({
        ...base,
        answer: { kind: 'scope_decision', value: 'supported_only' },
        owner_id: IDS.intent,
      }).success,
    ).toBe(false)
  })
})

describe('TaskPresentationAcknowledgementRequest', () => {
  const acknowledgement = {
    operation_id: IDS.operation,
    expected_revision: 8,
    presentation_id: IDS.presentation,
    acknowledgement_id: IDS.delivery,
  }

  it('accepts only the four technical acknowledgement fields', () => {
    expect(
      taskPresentationAcknowledgementRequestSchema.safeParse(acknowledgement)
        .success,
    ).toBe(true)
  })

  it.each([
    ['owner', { owner_id: IDS.intent }],
    ['intent', { intent_id: IDS.intent }],
    ['confirmation', { confirmed: true }],
    ['mutable text', { normalized_text: 'Изменённый текст' }],
  ])('rejects %s fields', (_name, extra) => {
    expect(
      taskPresentationAcknowledgementRequestSchema.safeParse({
        ...acknowledgement,
        ...extra,
      }).success,
    ).toBe(false)
  })
})

describe('Interpretation', () => {
  it.each([
    { kind: 'create_task', normalized_text: 'Купить молоко' },
    {
      kind: 'clarification',
      question: 'Что именно подготовить?',
      ambiguity_code: 'missing_subject',
    },
    {
      kind: 'mixed',
      normalized_text: 'Купить молоко',
      unsupported_summary: 'Отправка письма не поддерживается',
      scope_question: 'Продолжить только с задачей?',
    },
    { kind: 'unsupported', capability_code: 'email.send' },
  ])('accepts an exact discriminated variant', (input) => {
    expect(interpretationSchema.safeParse(input).success).toBe(true)
  })

  it.each([
    { kind: 'unknown', normalized_text: 'Текст' },
    { kind: 'create_task' },
    { kind: 'create_task', normalized_text: '' },
    { kind: 'unsupported', capability_code: 'email.send', raw: 'details' },
    {
      kind: 'mixed',
      normalized_text: 'Задача',
      unsupported_summary: 'Вторая часть',
    },
  ])('rejects malformed or unknown variants', (input) => {
    expect(interpretationSchema.safeParse(input).success).toBe(false)
  })
})

describe('domain unions', () => {
  it('accepts only approved operation and result values', () => {
    expect(operationStateSchema.safeParse('ready_to_present').success).toBe(true)
    expect(operationStateSchema.safeParse('pending').success).toBe(false)
    expect(resultKindSchema.safeParse('success').success).toBe(true)
    expect(resultKindSchema.safeParse('error').success).toBe(false)
  })

  it('accepts only trusted safe reason codes', () => {
    expect(safeReasonCodeSchema.safeParse('result_unverifiable').success).toBe(
      true,
    )
    expect(safeReasonCodeSchema.safeParse('raw database error').success).toBe(
      false,
    )
  })
})
