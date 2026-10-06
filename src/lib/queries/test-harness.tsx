/** Test support for hooks: render one against a QueryClient, wait for conditions, build a client like the app's. */
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createQueryClient } from '@/lib/query/client'
import { useLabSettings } from '@/lib/settings/lab-settings'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The app's real client configuration (error reporting, live defaults) with lab settings reset and retries off,
 * so failures surface at once. Retry behaviour reads the live lab setting, so a test may raise `retries` afterwards.
 */
export function testClient(): QueryClient {
  useLabSettings.getState().reset()
  useLabSettings.getState().set({ retries: 0 })
  return createQueryClient()
}

export interface HookHandle<T> {
  readonly result: { readonly current: T }
  unmount(): void
}

const mounted: { root: Root; container: HTMLElement }[] = []

export function renderHook<T>(hook: () => T, client: QueryClient): HookHandle<T> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const result = { current: undefined as T }
  function Probe(): null {
    result.current = hook()
    return null
  }
  act(() => root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>))
  const handle = { root, container }
  mounted.push(handle)
  return {
    result,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
      mounted.splice(mounted.indexOf(handle), 1)
    },
  }
}

/** Unmounts everything a test rendered. Call from afterEach. */
export function cleanupHooks(): void {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
}

/** Polls `condition` (flushing React between polls) until it holds or the timeout passes. */
export async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    })
  }
}

/** TanStack batches observer notifications with a zero-delay timer; this lets them reach React before assertions run. */
export const flush = (): Promise<void> => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 10))))

/** Runs an async action inside act() and swallows its rejection, for mutations whose failure is the point of the test. */
export async function settle(action: () => Promise<unknown>): Promise<void> {
  await act(async () => {
    await action().catch(() => undefined)
  })
  await flush()
}
