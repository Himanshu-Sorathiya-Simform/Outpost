import { describe, expect, it, vi } from 'vitest'
import { refCounted } from './lifecycle'

describe('refCounted', () => {
  it('starts once, tears down when the last disposer runs, and ignores repeated disposals', () => {
    const teardown = vi.fn()
    const start = vi.fn(() => teardown)
    const run = refCounted(start)
    const a = run()
    const b = run()
    expect(start).toHaveBeenCalledTimes(1)
    a()
    a()
    expect(teardown).not.toHaveBeenCalled()
    b()
    expect(teardown).toHaveBeenCalledTimes(1)
  })

  it('can start again after a full teardown, with fresh arguments', () => {
    const seen: string[] = []
    const run = refCounted((name: string) => {
      seen.push(name)
      return () => undefined
    })
    run('first')()
    run('second')()
    expect(seen).toEqual(['first', 'second'])
  })
})
