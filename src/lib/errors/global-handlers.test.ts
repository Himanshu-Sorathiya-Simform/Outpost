// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useVersionStatus } from '@/lib/version/status'
import { errorCenter, useErrorCenter } from './center'
import { installGlobalErrorHandlers } from './global-handlers'
import { useToastStore } from '@/lib/notify'

let dispose: () => void

beforeEach(() => {
  errorCenter.clear()
  useToastStore.getState().clear()
  useVersionStatus.setState({ chunkLoadFailed: false })
  dispose = installGlobalErrorHandlers()
})
afterEach(() => dispose())

const first = () => useErrorCenter.getState().records[0]

function rejection(reason: unknown): Event {
  const event = new Event('unhandledrejection')
  Object.defineProperty(event, 'reason', { value: reason })
  return event
}

describe('installGlobalErrorHandlers', () => {
  it('reports script errors as unhandled', () => {
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom'), message: 'boom' }))
    expect(first()?.error).toMatchObject({ kind: 'unhandled', message: 'boom' })
    expect(first()?.source).toBe('window.onerror')
  })

  it('ignores resource load failures, which are not ErrorEvents', () => {
    window.dispatchEvent(new Event('error'))
    expect(useErrorCenter.getState().records).toHaveLength(0)
  })

  it('ignores the ResizeObserver loop notice: browsers raise it for harmless layout feedback', () => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop completed with undelivered notifications.' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop limit exceeded' }))
    expect(useErrorCenter.getState().records).toHaveLength(0)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('reports unhandled rejections and keeps a more specific kind when there is one', () => {
    window.dispatchEvent(rejection(new Error('nobody caught me')))
    expect(first()?.error.kind).toBe('unhandled')
    window.dispatchEvent(rejection(new DOMException('denied', 'NotAllowedError')))
    expect(first()?.error.kind).toBe('permission')
  })

  it('treats vite:preloadError as chunk-load and flags the version store', () => {
    const event = new Event('vite:preloadError')
    Object.defineProperty(event, 'payload', { value: new Error('Unable to preload CSS for /assets/x.css') })
    window.dispatchEvent(event)
    expect(first()?.error.kind).toBe('chunk-load')
    expect(useVersionStatus.getState().chunkLoadFailed).toBe(true)
  })

  it('stops listening after dispose, and a second install shares the first', () => {
    const second = installGlobalErrorHandlers()
    window.dispatchEvent(rejection(new Error('once')))
    expect(useErrorCenter.getState().records[0]?.count).toBe(1)
    second()
    dispose()
    errorCenter.clear()
    window.dispatchEvent(rejection(new Error('after')))
    expect(useErrorCenter.getState().records).toHaveLength(0)
    dispose = installGlobalErrorHandlers()
  })
})
