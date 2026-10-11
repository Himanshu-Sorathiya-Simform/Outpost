import type { OutboxItem } from '@shared/sw-protocol'

/** A queued record as the page writes it, with whatever a test wants to change. */
export function item(id: string, patch: Partial<OutboxItem> = {}): OutboxItem {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    attempts: 0,
    status: 'queued',
    lastError: null,
    payload: { clientId: id, stationId: 'KRN-07', title: `Dispatch ${id}`, body: 'Body', severity: 'routine', tags: [], coords: null },
    ...patch,
  }
}

/** The answers of POST /api/dispatches the replay has to tell apart. */
export const answers = {
  created: () => new Response(JSON.stringify({ id: 'dp-1' }), { status: 201, headers: { 'content-type': 'application/json' } }),
  replay: () => new Response(JSON.stringify({ id: 'dp-1' }), { status: 200, headers: { 'content-type': 'application/json', 'Idempotent-Replay': 'true' } }),
  error: (status: number, message: string, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify({ error: { code: 'x', message, requestId: 'r' } }), { status, headers: { 'content-type': 'application/json', ...headers } }),
}
