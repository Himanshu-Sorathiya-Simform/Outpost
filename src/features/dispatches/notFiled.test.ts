import { describe, expect, it } from 'vitest'
import { AppError, type AppErrorKind } from '@/lib/errors/app-error'
import { notFiledTitle, reasonFor } from './notFiled'

const error = (kind: AppErrorKind): AppError => new AppError({ kind, message: kind })

describe('reasonFor', () => {
  it('tells a 404 from an unreachable relay from a cache that has nothing', () => {
    expect(reasonFor(error('not-found'))).toBe('missing')
    expect(reasonFor(error('network'))).toBe('unreachable')
    expect(reasonFor(error('unavailable'))).toBe('unreachable')
    expect(reasonFor(error('offline'))).toBe('unstored')
    expect(reasonFor(error('cache-miss'))).toBe('unstored')
  })

  it('leaves contract and parse faults to the generic error state', () => {
    expect(reasonFor(error('schema-mismatch'))).toBeNull()
    expect(notFiledTitle('dp-000001', error('parse'))).toBe('Could not open dp-000001')
  })

  it('names the dispatch in the title', () => {
    expect(notFiledTitle('dp-000999', error('not-found'))).toBe('Nothing filed under dp-000999')
  })
})
