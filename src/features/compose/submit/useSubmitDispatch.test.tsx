// @vitest-environment jsdom
import type { QueryClient } from '@tanstack/react-query'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorCenter } from '@/lib/errors/center'
import { useToastStore } from '@/lib/notify'
import { FakeServer, errorResponse, makeDispatch } from '@/lib/queries/fake-server'
import { qk } from '@/lib/queries/keys'
import { sessionPrompt, useSessionPrompt } from '@/lib/queries/session-prompt'
import { cleanupHooks, renderHook, testClient, waitFor } from '@/lib/queries/test-harness'
import { PwaNotImplementedError } from '@/pwa/errors'
import { DRAFTS_KEY } from '../drafts/draft-schema'
import { draftActions, useDraftStore } from '../drafts/draft-store'
import { BLANK_VALUES, draftInputFromValues, type FormValues } from '../form/form-values'
import { useSubmitDispatch, type SubmitJob } from './useSubmitDispatch'

const navigate = vi.fn()
const queueDispatch = vi.fn()

vi.mock('react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/pwa', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/pwa')>()),
  pwa: { sync: { queueDispatch: (input: unknown) => queueDispatch(input) } },
}))

const values: FormValues = { ...BLANK_VALUES, stationId: 'KRN-07', title: 'Relay mast icing', body: 'Rime on the guy wires.' }

let server: FakeServer
let client: QueryClient

beforeEach(() => {
  server = new FakeServer([makeDispatch(1), makeDispatch(2), makeDispatch(3)])
  client = testClient()
  vi.stubGlobal('fetch', server.fetch)
  localStorage.clear()
  useDraftStore.setState({ drafts: [], persisted: true })
  errorCenter.clear()
  useToastStore.getState().clear()
  sessionPrompt.close()
  navigate.mockReset()
  queueDispatch.mockReset()
})
afterEach(() => {
  cleanupHooks()
  client.clear()
  vi.unstubAllGlobals()
})

function draftJob(clientId = 'client-key-0001', form: FormValues = values): SubmitJob {
  const draft = draftActions.create({ input: draftInputFromValues(form), origin: 'manual', clientId })
  return { draftId: draft.id, clientId, values: form }
}

const toastTitles = (): string[] => useToastStore.getState().toasts.map((t) => t.title)
const posts = () => server.callsTo('POST', '/api/dispatches')

async function send(job: SubmitJob) {
  const h = renderHook(() => useSubmitDispatch(), client)
  await act(async () => void h.result.current.submit(job))
  return h
}

describe('useSubmitDispatch', () => {
  it('files under the draft key with the press time, removes the draft and opens the dispatch', async () => {
    const job = draftJob('client-key-aaaa')
    const h = await send(job)
    await waitFor(() => navigate.mock.calls.length > 0)

    expect(posts()).toHaveLength(1)
    expect(posts()[0]?.headers.get('Idempotency-Key')).toBe('client-key-aaaa')
    expect(posts()[0]?.body).toMatchObject({ clientId: 'client-key-aaaa', title: 'Relay mast icing', stationId: 'KRN-07' })
    expect((posts()[0]?.body as { filedAtClient?: string }).filedAtClient).toEqual(expect.any(String))
    expect(navigate).toHaveBeenCalledWith('/log/dp-000004')
    expect(useDraftStore.getState().drafts).toHaveLength(0)
    expect(toastTitles()).toEqual(['Dispatch filed'])
    expect(h.result.current.state.status).toBe('idle')
  })

  it('says so when the relay already had it', async () => {
    await send(draftJob('client-key-bbbb'))
    await waitFor(() => navigate.mock.calls.length === 1)
    useToastStore.getState().clear()
    await send(draftJob('client-key-bbbb'))
    await waitFor(() => navigate.mock.calls.length === 2)
    expect(toastTitles()).toEqual(['Already filed — this was a retry'])
    expect(server.dispatches).toHaveLength(4)
  })

  it('does not touch the network for an entry that fails validation', async () => {
    const h = await send(draftJob('client-key-cccc', { ...values, title: 'ab' }))
    expect(posts()).toHaveLength(0)
    const { state } = h.result.current
    expect(state.status === 'invalid' && state.errors.title).toBe('Title needs at least 3 characters.')
    expect(useDraftStore.getState().drafts).toHaveLength(1)
  })

  it('ignores a second press while the first is in flight', async () => {
    const release = server.hold('POST')
    const job = draftJob('client-key-dddd')
    const h = renderHook(() => useSubmitDispatch(), client)
    await act(async () => {
      h.result.current.submit(job)
      h.result.current.submit(job)
    })
    expect(h.result.current.pending).toBe(true)
    release()
    await waitFor(() => navigate.mock.calls.length > 0)
    expect(posts()).toHaveLength(1)
  })

  it('maps the relay validation issues onto fields and keeps the draft', async () => {
    server.failNext('POST', '/api/dispatches', () =>
      errorResponse(422, 'validation_failed', 'Invalid dispatch', [{ code: 'custom', path: ['stationId'], message: 'Unknown station' }]),
    )
    const h = await send(draftJob('client-key-eeee'))
    await waitFor(() => h.result.current.state.status === 'rejected')
    const { state } = h.result.current
    expect(state.status === 'rejected' && state.errors).toEqual({ stationId: 'Unknown station' })
    expect(useDraftStore.getState().drafts).toHaveLength(1)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('counts down a rate limit from Retry-After', async () => {
    server.failNext('POST', '/api/dispatches', () => errorResponse(429, 'rate_limited', 'Slow down', undefined, { 'Retry-After': '7' }))
    const before = Date.now()
    const h = await send(draftJob('client-key-ffff'))
    await waitFor(() => h.result.current.state.status === 'rate-limited')
    const { state } = h.result.current
    const until = state.status === 'rate-limited' ? state.until : 0
    expect(until - before).toBeGreaterThanOrEqual(6900)
    expect(until - before).toBeLessThan(9000)
  })

  describe('with no link to the relay', () => {
    beforeEach(() => vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch'))))

    it('keeps the dispatch on the device when the outbox is not wired up', async () => {
      queueDispatch.mockRejectedValue(new PwaNotImplementedError('sync.queueDispatch'))
      const job = draftJob('client-key-gggg')
      const h = await send(job)
      await waitFor(() => h.result.current.state.status === 'kept-locally')

      expect(queueDispatch).toHaveBeenCalledTimes(1)
      expect(queueDispatch.mock.calls[0]?.[0]).toMatchObject({ clientId: 'client-key-gggg', title: 'Relay mast icing' })
      const [draft] = useDraftStore.getState().drafts
      expect(draft).toMatchObject({ origin: 'offline-failed', clientId: 'client-key-gggg' })
      expect(draft?.lastError).toEqual(expect.any(String))
      expect(navigate).not.toHaveBeenCalled()
      expect(JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? '{}').drafts).toHaveLength(1)
    })

    it('marks the draft queued and goes to the drafts page when the outbox takes it', async () => {
      queueDispatch.mockResolvedValue({ id: 'client-key-hhhh' })
      await send(draftJob('client-key-hhhh'))
      await waitFor(() => navigate.mock.calls.length > 0)

      expect(navigate).toHaveBeenCalledWith('/drafts')
      expect(useDraftStore.getState().drafts[0]).toMatchObject({ origin: 'queued', lastError: null })
      expect(toastTitles()).toEqual(['Queued'])
    })

    it('reports an outbox that fails for real, and still keeps the draft', async () => {
      queueDispatch.mockRejectedValue(new Error('IndexedDB blocked'))
      const h = await send(draftJob('client-key-iiii'))
      await waitFor(() => h.result.current.state.status === 'queue-failed')
      expect(useDraftStore.getState().drafts[0]?.origin).toBe('offline-failed')
    })
  })

  describe('off shift', () => {
    it('asks for a clock-in first and sends once the shift starts, with the original press', async () => {
      server.signedIn = false
      const h = renderHook(() => useSubmitDispatch(), client)
      // The session query has to have answered "signed out" before the button is pressed.
      await waitFor(() => client.getQueryData(qk.session()) !== undefined)
      await act(async () => void h.result.current.submit(draftJob('client-key-jjjj')))

      expect(h.result.current.state.status).toBe('awaiting-session')
      expect(useSessionPrompt.getState().open).toBe(true)
      expect(posts()).toHaveLength(0)

      server.signedIn = true
      await act(async () => void (await client.refetchQueries({ queryKey: qk.session() })))
      await waitFor(() => navigate.mock.calls.length > 0)
      expect(posts()).toHaveLength(1)
      expect(posts()[0]?.headers.get('Idempotency-Key')).toBe('client-key-jjjj')
    })
  })
})
