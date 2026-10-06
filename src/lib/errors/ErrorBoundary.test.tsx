// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorCenter, useErrorCenter } from './center'
import { ErrorBoundary } from './ErrorBoundary'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  errorCenter.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  // React logs caught render errors to console.error; that is noise here.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

function Bomb({ fail }: { fail: boolean }) {
  if (fail) throw new Error('render exploded')
  return <p>fine</p>
}

describe('ErrorBoundary', () => {
  it('renders the fallback with a render AppError and reports it once with the component stack', () => {
    act(() =>
      root.render(
        <ErrorBoundary source="route:/test" fallback={(error) => <p role="alert">{error.kind}:{error.message}</p>}>
          <Bomb fail />
        </ErrorBoundary>,
      ),
    )
    expect(container.textContent).toBe('render:render exploded')
    const records = useErrorCenter.getState().records
    expect(records).toHaveLength(1)
    expect(records[0]?.source).toBe('route:/test')
    expect(typeof records[0]?.error.context.componentStack).toBe('string')
  })

  it('keeps the kind of an already classified error (a failed lazy route)', () => {
    function Lazy(): never {
      throw new TypeError('Failed to fetch dynamically imported module: /assets/x.js')
    }
    act(() => root.render(<ErrorBoundary fallback={(error) => <p>{error.kind}</p>}><Lazy /></ErrorBoundary>))
    expect(container.textContent).toBe('chunk-load')
  })

  it('reset() gives the children another attempt', () => {
    let allowRender = false
    function Flaky() {
      if (!allowRender) throw new Error('not yet')
      return <p>recovered</p>
    }
    act(() =>
      root.render(
        <ErrorBoundary fallback={(_e, reset) => <button onClick={reset}>retry</button>}>
          <Flaky />
        </ErrorBoundary>,
      ),
    )
    expect(container.textContent).toBe('retry')
    allowRender = true
    act(() => container.querySelector('button')?.click())
    expect(container.textContent).toBe('recovered')
  })

  it('resets itself when a resetKey changes', () => {
    function Harness() {
      const [key, setKey] = useState(0)
      return (
        <>
          <button onClick={() => setKey(1)}>next</button>
          <ErrorBoundary resetKeys={[key]} fallback={() => <p>failed</p>}>
            <Bomb fail={key === 0} />
          </ErrorBoundary>
        </>
      )
    }
    act(() => root.render(<Harness />))
    expect(container.textContent).toContain('failed')
    act(() => container.querySelector('button')?.click())
    expect(container.textContent).toContain('fine')
  })
})
