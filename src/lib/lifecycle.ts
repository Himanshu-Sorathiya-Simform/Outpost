/**
 * Every `start*()` in src/lib wires up listeners, observers or timers. They are reference counted so that
 * React StrictMode's mount → unmount → mount, hot reloads and tests can call them any number of times:
 * the real work starts on the first call and is torn down when the last returned disposer has run.
 * Disposers are themselves idempotent.
 */
export function refCounted<A extends unknown[]>(start: (...args: A) => () => void): (...args: A) => () => void {
  let refs = 0
  let teardown: (() => void) | null = null
  return (...args: A) => {
    if (refs === 0) teardown = start(...args)
    refs += 1
    let released = false
    return () => {
      if (released) return
      released = true
      refs -= 1
      if (refs === 0) {
        teardown?.()
        teardown = null
      }
    }
  }
}
