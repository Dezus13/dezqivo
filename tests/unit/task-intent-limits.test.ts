import { describe, expect, it } from 'vitest'

import {
  countUnicodeCodePoints,
  countUtf8Bytes,
} from '../../src/contracts/task-intent'

describe('task intent text measurement', () => {
  it('counts UTF-8 bytes for ASCII and multi-byte Unicode', () => {
    expect(countUtf8Bytes('task')).toBe(4)
    expect(countUtf8Bytes('🙂')).toBe(4)
    expect(countUtf8Bytes('задача')).toBe(12)
  })

  it('counts Unicode code points instead of UTF-16 code units', () => {
    expect('🙂'.length).toBe(2)
    expect(countUnicodeCodePoints('🙂')).toBe(1)
    expect(countUnicodeCodePoints('a🙂б')).toBe(3)
  })
})
