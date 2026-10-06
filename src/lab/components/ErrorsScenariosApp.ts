import { callSeam } from '@/lib'
import { pwa } from '@/pwa'
import { holdVersionSkew, undoVersionSkew } from './ErrorsSkew'
import { probe } from './ErrorsScenarioHelpers'
import type { Scenario } from './ErrorsScenarioTypes'

/** Never built, never deployed. Assembled at run time so the bundler cannot see it, exactly like the router's broken route. */
const MISSING_CHUNK = '/assets/never-built-' + 'simulator-chunk.js'

/** Failures from the app's own machinery: the module loader, React, the event loop, the seam wrapper, the version gate. */
export const APP_SCENARIOS: Scenario[] = [
  {
    kind: 'chunk-load',
    real: true,
    how: 'import() of a hashed file that was never deployed, the failure an old tab meets after a release. Only the router version below also raises the stale-screen banner.',
    actions: [
      {
        id: 'run',
        label: 'Import a missing chunk',
        run: async () => {
          await probe('chunk-load', async () => {
            await import(/* @vite-ignore */ MISSING_CHUNK)
          })
        },
      },
    ],
  },
  {
    kind: 'render',
    real: true,
    how: 'Mounts a child that throws while React renders it, inside the local boundary above. The boundary catches it, shows its fallback and files a render error with the component stack.',
    actions: [
      {
        id: 'run',
        label: 'Crash the render box',
        run: async (ctx) => {
          ctx.crash()
          return { note: 'The render box above is showing its fallback. Reset it there. React retries a failed render once before it gives up, so the row can read x2.' }
        },
      },
    ],
  },
  {
    kind: 'unhandled',
    real: true,
    how: 'Two failures nobody handles: an exception thrown in a timer, and a rejected promise with no catch. Neither can reach a boundary, so the window handlers file them.',
    caution: 'The browser prints both to the console as well. That is the point.',
    actions: [
      {
        id: 'timer',
        label: 'Throw in a timer',
        run: async () => {
          setTimeout(() => {
            throw new Error('Simulated exception in a timer callback')
          }, 0)
          return { note: 'The throw happened outside this click, so the caller saw nothing.' }
        },
      },
      {
        id: 'promise',
        label: 'Reject with no catch',
        run: async () => {
          void Promise.reject(new Error('Simulated rejection that nobody awaited'))
          return { note: 'The rejection was never handled, so the caller saw nothing.' }
        },
      },
    ],
  },
  {
    kind: 'not-implemented',
    real: true,
    how: 'Calls pwa.registration.register() through callSeam. It is still a stub, so it throws PwaNotImplementedError, which callSeam turns into this kind.',
    caution: 'Once you implement registration.register, this button runs it for real.',
    quietReason: 'callSeam logs a stub in the bridge log (Lab, Queue) and throws, but never files it here. A stub is a state, not a fault.',
    actions: [
      {
        id: 'run',
        label: 'Call registration.register',
        run: async () => {
          await callSeam('registration.register', () => pwa.registration.register())
        },
      },
    ],
  },
  {
    kind: 'version-skew',
    real: true,
    how: 'Raises minClient on the relay to 99.0.0 through the release endpoint. The version check sees it and the app shows its blocking gate for five seconds, then minClient is put back.',
    caution: 'The whole app is blocked while the gate is up. Undo restores it at once.',
    actions: [
      {
        id: 'run',
        label: 'Raise minClient',
        confirm: {
          title: 'Block the app for five seconds?',
          body: 'This tells the relay that every client older than 99.0.0 must update. Outpost will cover the screen with its update gate, then the simulator sets minClient back. If the page is closed in between, the restore is still sent.',
          label: 'Raise minClient',
        },
        run: holdVersionSkew,
      },
      {
        id: 'undo',
        label: 'Undo',
        always: true,
        run: async () => ({ note: (await undoVersionSkew()) ? 'minClient is back where it was.' : 'Nothing to undo. minClient was not raised by this page.' }),
      },
    ],
  },
]
