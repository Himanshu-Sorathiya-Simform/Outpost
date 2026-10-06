import { z } from 'zod'
import { API, StationList, type ChaosMode } from '@shared/contracts'
import { apiFetch, queryClient, type AppErrorKind } from '@/lib'
import { endpoints, newClientId, qk } from '@/lib/queries'
import { CHAOS_TARGET, probe, withChaosRule } from './ErrorsScenarioHelpers'
import type { Scenario } from './ErrorsScenarioTypes'

const where = CHAOS_TARGET

/** A scenario answered by a temporary one-route chaos rule: the relay itself says something wrong. */
function viaRule(kind: AppErrorKind, patch: { mode: ChaosMode; status?: number; retryAfterSec?: number }, how: string, label: string): Scenario {
  return {
    kind,
    real: true,
    how: `${how} The rule covers ${where} only and is removed again in a finally block.`,
    actions: [
      {
        id: 'run',
        label,
        run: async () => {
          await withChaosRule(patch, () => probe(kind, () => endpoints.getStations()))
        },
      },
    ],
  }
}

/** Failures produced by a real request to the real relay. */
export const HTTP_SCENARIOS: Scenario[] = [
  {
    ...viaRule('network', { mode: 'drop' }, 'The relay destroys the socket mid-request, so fetch() rejects with a TypeError. apiFetch calls that a network failure.', 'Drop the socket'),
    caution: 'Behind the Vite dev proxy (npm run dev) the proxy answers 502 for the dead socket, so you will see unavailable. Under npm run pwa the socket really drops.',
  },
  {
    kind: 'timeout',
    real: true,
    how: 'apiFetch with timeoutMs: 1. Its own timer fires before any answer can arrive and aborts the request.',
    actions: [
      {
        id: 'run',
        label: 'Ask with a 1 ms deadline',
        run: async () => {
          await probe('timeout', () => apiFetch({ path: API.stations, schema: StationList, timeoutMs: 1 }))
        },
      },
    ],
  },
  {
    kind: 'aborted',
    real: true,
    how: 'A request started with an AbortController, cancelled one line later, the way an unmounting screen cancels its fetch.',
    quietReason: 'The query cache never files a cancellation. Nobody needs to hear about a request they abandoned.',
    actions: [
      {
        id: 'run',
        label: 'Start and cancel',
        run: async () => {
          const controller = new AbortController()
          const pending = probe('aborted', () => apiFetch({ path: API.stations, schema: StationList, signal: controller.signal }))
          controller.abort()
          await pending
        },
      },
    ],
  },
  {
    kind: 'unauthorized',
    real: true,
    how: 'Expires every session on the relay, then files a dispatch without one. The relay answers 401.',
    caution: 'Ends your clock-in. Clock in again from the top bar afterwards.',
    actions: [
      {
        id: 'run',
        label: 'Expire, then write',
        run: async () => {
          await endpoints.controlSession({ action: 'expire' })
          try {
            await probe('unauthorized', () =>
              endpoints.createDispatch(
                { clientId: newClientId(), stationId: 'st-krn07', title: 'Simulator probe', body: 'Sent with no session. The relay should refuse it and file nothing.', severity: 'routine' },
                newClientId(),
              ),
            )
          } finally {
            await queryClient.invalidateQueries({ queryKey: qk.session() })
          }
        },
      },
    ],
  },
  viaRule('forbidden', { mode: 'status', status: 403 }, 'The relay answers 403 with its uniform error body. The relay has no real 403 route, so a rule stands in for one.', 'Answer 403'),
  {
    kind: 'not-found',
    real: true,
    how: 'Asks for a dispatch id that does not exist. The relay answers 404 with a JSON error, never an HTML page.',
    actions: [
      {
        id: 'run',
        label: 'Fetch a missing dispatch',
        run: async () => {
          await probe('not-found', () => endpoints.getDispatch('dp-lab-missing'))
        },
      },
    ],
  },
  {
    kind: 'conflict',
    real: true,
    how: 'Patches a real dispatch with an If-Match that names a revision it has never had. The relay answers 412 and changes nothing.',
    actions: [
      {
        id: 'run',
        label: 'Send a stale If-Match',
        run: async () => {
          const { data } = await endpoints.getDispatchPage({ limit: 1 })
          const first = data.items[0]
          if (!first) return { note: 'The relay has no dispatches to patch.' }
          await probe('conflict', () => endpoints.patchDispatch(first.id, { read: first.read }, { ifMatch: `W/"${first.id}-r0"` }))
        },
      },
    ],
  },
  {
    kind: 'validation',
    real: true,
    how: 'Clocks in with a callsign the relay refuses (a single exclamation mark). The relay answers 422 and lists the failing field.',
    actions: [
      {
        id: 'run',
        label: 'Send an invalid callsign',
        run: async () => {
          await probe('validation', () => endpoints.createSession('!'))
        },
      },
    ],
  },
  viaRule('rate-limited', { mode: 'rate-limit', retryAfterSec: 3 }, 'The relay answers 429 with Retry-After: 3. Open the row to see the wait recorded in the context.', 'Answer 429'),
  viaRule('unavailable', { mode: 'status', status: 503 }, 'The relay answers 503, the status a service worker would meet when the origin is down behind a proxy.', 'Answer 503'),
  viaRule('server', { mode: 'status', status: 500 }, 'The relay answers 500 with an error body. This one is not worth retrying blindly, and not worth caching.', 'Answer 500'),
  viaRule('http', { mode: 'status', status: 418 }, 'The relay answers 418. No rule in apiFetch names that status, so it lands in the catch-all.', 'Answer 418'),
  {
    kind: 'parse',
    real: true,
    how: 'Fetches the site root, asking for it as a page, where the app expects JSON. A 200 text/html is what a captive portal or an SPA fallback sends.',
    actions: [
      {
        id: 'run',
        label: 'Fetch / as JSON',
        run: async () => {
          await probe('parse', () => apiFetch({ path: '/', headers: { Accept: 'text/html' }, schema: z.unknown() }))
        },
      },
    ],
  },
  {
    kind: 'schema-mismatch',
    real: true,
    how: 'Fetches the real station list, then checks it against a contract that wants items to be a number. The relay is fine; the client expectation is wrong, as after a stale deploy.',
    actions: [
      {
        id: 'run',
        label: 'Validate against a wrong schema',
        run: async () => {
          await probe('schema-mismatch', () => apiFetch({ path: API.stations, schema: z.object({ items: z.number() }) }))
        },
      },
    ],
  },
]
