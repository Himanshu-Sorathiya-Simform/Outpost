import { AppError } from '@/lib'
import { asIfOffline, synthetic } from './ErrorsScenarioHelpers'
import type { Scenario } from './ErrorsScenarioTypes'

/**
 * Built by hand because the real thing needs a browser fault, a hostile storage state or a service worker that does not exist yet.
 * The exception objects are real DOMExceptions and TypeErrors, classified by the same toAppError the app uses; only the trigger is constructed.
 */
export const SYNTHETIC_SCENARIOS: Scenario[] = [
  {
    kind: 'offline',
    real: false,
    how: 'A fetch TypeError classified while navigator.onLine reads false for one synchronous call. For the real thing, open DevTools, Network, Offline, and use the app.',
    actions: [
      {
        id: 'run',
        label: 'Classify as offline',
        run: async () => asIfOffline(() => synthetic(new TypeError('Failed to fetch'))),
      },
    ],
  },
  {
    kind: 'cache-miss',
    real: false,
    how: 'The AppError a cache-only route produces: a 504 carrying X-SW-Source: cache-miss. No service worker exists yet to answer that way, so the error is built here.',
    actions: [
      {
        id: 'run',
        label: 'File a cache miss',
        run: async () => ({
          error: new AppError({
            kind: 'cache-miss',
            message: 'Cache-only route GET /api/handbook/loss-of-contact had no stored copy (HTTP 504, X-SW-Source: cache-miss)',
            context: { url: '/api/handbook/loss-of-contact', method: 'GET', status: 504, swSource: 'cache-miss', source: 'lab:simulator' },
          }),
          file: true,
        }),
      },
    ],
  },
  {
    kind: 'permission',
    real: false,
    how: 'A DOMException named NotAllowedError, what a denied Notification prompt or a blocked clipboard write throws.',
    actions: [
      {
        id: 'run',
        label: 'Throw NotAllowedError',
        run: async () => synthetic(new DOMException('Notification permission was denied by the user', 'NotAllowedError')),
      },
    ],
  },
  {
    kind: 'unsupported',
    real: false,
    how: 'The TypeError a browser raises when a seam calls an API it does not have (navigator.share on desktop Firefox). Only calls made through callSeam are read this way.',
    actions: [
      {
        id: 'run',
        label: 'Call a missing API',
        run: async () => synthetic(new TypeError('navigator.share is not a function'), { apiCall: true, feature: 'share.share' }),
      },
    ],
  },
  {
    kind: 'quota',
    real: false,
    how: 'A DOMException named QuotaExceededError, what cache.put() or an IndexedDB write throws when the origin is out of space.',
    actions: [
      {
        id: 'run',
        label: 'Throw QuotaExceededError',
        run: async () => synthetic(new DOMException('The quota has been exceeded.', 'QuotaExceededError')),
      },
    ],
  },
  {
    kind: 'unknown',
    real: false,
    how: 'An ordinary Error that no rule in normalize.ts recognises, so it stays unclassified.',
    actions: [
      {
        id: 'run',
        label: 'Throw an unclassified error',
        run: async () => synthetic(new RangeError('Something no rule has a name for')),
      },
    ],
  },
]
