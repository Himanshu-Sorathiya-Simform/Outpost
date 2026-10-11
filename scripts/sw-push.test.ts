import { describe, expect, it, vi } from 'vitest'
import { HEALTHY, queuedRecord, readOutbox, seedOutbox, setup } from './sw-harness'

/** A payload as the server sends it (docs/CONTRACTS.md 9.3), with whatever a test changes. */
const payload = (patch: Record<string, unknown> = {}) => ({
  v: 1,
  kind: 'dispatch',
  title: 'TLV-04: Link dropped',
  body: 'Feeder SWR jumped',
  url: '/log/dp-000064',
  tag: 'dispatch-dp-000064',
  dispatchId: 'dp-000064',
  badgeCount: 10,
  icon: '/icons/icon-192.png',
  image: null,
  actions: [
    { action: 'open', title: 'Open' },
    { action: 'ack', title: 'Acknowledge' },
  ],
  requireInteraction: false,
  silent: false,
  sentAt: '2026-01-01T00:00:00.000Z',
  ...patch,
})

/** A window the worker can see: visible or hidden, focused or not. It records focus() and what it was sent. */
function windowClient(state: { focused?: boolean; visible?: boolean } = {}) {
  const sent: unknown[] = []
  return {
    focused: state.focused ?? false,
    visibilityState: state.visible === false ? 'hidden' : 'visible',
    focus: vi.fn(async () => undefined),
    postMessage: (message: unknown) => void sent.push(message),
    sent,
  }
}

/** Fires `push` and waits for what the worker handed to waitUntil. `data` is what event.data.json() gives, or a function that throws. */
async function push(sw: ReturnType<typeof setup>, data: unknown): Promise<void> {
  let work: Promise<unknown> = Promise.resolve()
  const event = {
    data: data === null ? null : { json: typeof data === 'function' ? (data as () => unknown) : () => data },
    waitUntil: (p: Promise<unknown>) => void (work = p),
  }
  sw.handler('push')(event)
  await work
}

/** Fires `notificationclick`. */
async function click(sw: ReturnType<typeof setup>, data: unknown, action = ''): Promise<{ close: ReturnType<typeof vi.fn> }> {
  let work: Promise<unknown> = Promise.resolve()
  const notification = { close: vi.fn(), data }
  sw.handler('notificationclick')({ notification, action, waitUntil: (p: Promise<unknown>) => void (work = p) })
  await work
  return notification
}

const notificationData = (patch: Record<string, unknown> = {}) => ({ url: '/log/dp-000064', dispatchId: 'dp-000064', kind: 'dispatch', ...patch })

describe('the push event', () => {
  it('registers a listener for push and for notificationclick', () => {
    const sw = setup(HEALTHY)
    expect(sw.handlers.has('push')).toBe(true)
    expect(sw.handlers.has('notificationclick')).toBe(true)
  })

  it('shows a notification with the payload fields, and carries the url, dispatch id and kind in `data`', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    await push(sw, payload())
    expect(sw.showNotification).toHaveBeenCalledExactlyOnceWith(
      'TLV-04: Link dropped',
      expect.objectContaining({
        body: 'Feeder SWR jumped',
        icon: '/icons/icon-192.png',
        tag: 'dispatch-dp-000064',
        requireInteraction: false,
        actions: [
          { action: 'open', title: 'Open' },
          { action: 'ack', title: 'Acknowledge' },
        ],
        data: { url: '/log/dp-000064', dispatchId: 'dp-000064', kind: 'dispatch' },
      }),
    )
  })

  it('leaves tag and image out when the payload has none', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    await push(sw, payload({ tag: null, image: null }))
    const options = sw.showNotification.mock.calls[0]?.[1] as Record<string, unknown>
    expect(options).not.toHaveProperty('tag')
    expect(options).not.toHaveProperty('image')
  })

  it('passes requireInteraction through, and keeps at most two actions', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    await push(sw, payload({ requireInteraction: true, actions: [{ action: 'a', title: 'A' }, { action: 'b', title: 'B' }, { action: 'c', title: 'C' }] }))
    const options = sw.showNotification.mock.calls[0]?.[1] as { requireInteraction: boolean; actions: unknown[] }
    expect(options.requireInteraction).toBe(true)
    expect(options.actions).toHaveLength(2)
  })

  it('shows a custom push exactly as sent', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    await push(sw, payload({ kind: 'custom', title: 'Hello', body: '', url: '/log', tag: null, dispatchId: null, actions: [] }))
    expect(sw.showNotification).toHaveBeenCalledWith('Hello', expect.objectContaining({ body: '', data: { url: '/log', dispatchId: null, kind: 'custom' } }))
  })

  it('tells a visible, focused window and shows NO system notification, so the person does not get both', async () => {
    const sw = setup(HEALTHY)
    const focused = windowClient({ focused: true })
    sw.setWindows([focused])
    await push(sw, payload())
    expect(sw.showNotification).not.toHaveBeenCalled()
    expect(focused.sent).toEqual([{ type: 'push-received', payload: expect.objectContaining({ title: 'TLV-04: Link dropped', dispatchId: 'dp-000064' }) }])
  })

  it.each([
    ['a window that is visible but not focused', { focused: false, visible: true }],
    ['a window that is focused but hidden', { focused: true, visible: false }],
    ['a hidden, unfocused window', { focused: false, visible: false }],
  ])('shows the notification for %s', async (_name, state) => {
    const sw = setup(HEALTHY)
    sw.setWindows([windowClient(state)])
    await push(sw, payload())
    expect(sw.showNotification).toHaveBeenCalledTimes(1)
  })

  it('shows the notification when no window is open at all', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    await push(sw, payload())
    expect(sw.showNotification).toHaveBeenCalledTimes(1)
  })

  it('answers a push with no data, or data that is not JSON, with a plain notification, so the push is never silent by accident', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    await push(sw, null)
    await push(sw, () => {
      throw new SyntaxError('Unexpected token')
    })
    await push(sw, 'just text')
    await push(sw, { nothing: 'useful' })
    expect(sw.showNotification).toHaveBeenCalledTimes(4)
    expect(sw.showNotification).toHaveBeenCalledWith('Outpost', { body: 'A message arrived that this version of the app could not read.' })
  })

  it('fills in what a payload from elsewhere leaves out, without showing "undefined"', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    await push(sw, { title: 'Bare', body: 'Only a title and a body' })
    expect(sw.showNotification).toHaveBeenCalledWith('Bare', expect.objectContaining({ icon: '/icons/icon-192.png', actions: [], requireInteraction: false, data: { url: '/', dispatchId: null, kind: 'custom' } }))
  })

  it('stores a url on another origin as "/" in the notification data', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    await push(sw, payload({ url: 'https://evil.example/phish' }))
    expect((sw.showNotification.mock.calls[0]?.[1] as { data: { url: string } }).data.url).toBe('/')
  })
})

describe('silent pushes', () => {
  it('silent-badge shows no notification and tells the open windows, so the inbox refetches', async () => {
    const sw = setup(HEALTHY)
    const open = windowClient()
    sw.setWindows([open])
    await push(sw, payload({ kind: 'silent-badge', silent: true, title: 'Badge update', url: '/inbox', actions: [], tag: null, dispatchId: null }))
    expect(sw.showNotification).not.toHaveBeenCalled()
    expect(open.sent).toEqual([{ type: 'push-received', payload: expect.objectContaining({ kind: 'silent-badge', silent: true, badgeCount: 10 }) }])
  })

  it('sync-poke replays the outbox, shows no notification, and tells the windows', async () => {
    const sw = setup(HEALTHY)
    const open = windowClient()
    sw.setWindows([open])
    await seedOutbox(sw, [queuedRecord('cid-00000001')])
    sw.sandbox.fetch = (async () => new Response('{"id":"dp-1"}', { status: 201, headers: { 'content-type': 'application/json' } })) as never
    await push(sw, payload({ kind: 'sync-poke', silent: true, title: 'Sync poke', url: '/log', actions: [], tag: null, dispatchId: null }))
    expect(await readOutbox(sw)).toEqual([])
    expect(sw.showNotification).not.toHaveBeenCalled()
    expect(open.sent.map((m) => (m as { type: string }).type)).toEqual(['sync-complete', 'push-received'])
  })

  it('sync-poke does not fail the push when the outbox cannot be sent (the browser would count a failed push handler)', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([windowClient()])
    await seedOutbox(sw, [queuedRecord('cid-00000001')])
    sw.sandbox.fetch = (async () => {
      throw new TypeError('Failed to fetch')
    }) as never
    await expect(push(sw, payload({ kind: 'sync-poke', silent: true }))).resolves.toBeUndefined()
    expect(sw.warnings.some((w) => String(w[0]).includes('sync poke'))).toBe(true)
    expect(await readOutbox(sw)).toEqual([expect.objectContaining({ status: 'queued', attempts: 1 })])
  })

  it('treats a payload with silent: true as silent whatever its kind says', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    await push(sw, payload({ kind: 'custom', silent: true }))
    expect(sw.showNotification).not.toHaveBeenCalled()
  })
})

describe('the notification click', () => {
  it('closes the notification', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    const notification = await click(sw, notificationData())
    expect(notification.close).toHaveBeenCalledTimes(1)
  })

  it('opens a new window at the url when none is open', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    await click(sw, notificationData())
    expect(sw.openWindow).toHaveBeenCalledExactlyOnceWith('/log/dp-000064')
  })

  it('focuses a window that is open and tells it to navigate, without opening another', async () => {
    const sw = setup(HEALTHY)
    const open = windowClient()
    sw.setWindows([open])
    await click(sw, notificationData())
    expect(open.focus).toHaveBeenCalledTimes(1)
    expect(open.sent).toEqual([{ type: 'navigate', url: '/log/dp-000064' }])
    expect(sw.openWindow).not.toHaveBeenCalled()
  })

  it('prefers a visible window over a hidden one', async () => {
    const sw = setup(HEALTHY)
    const hidden = windowClient({ visible: false })
    const visible = windowClient({ visible: true })
    sw.setWindows([hidden, visible])
    await click(sw, notificationData())
    expect(visible.sent).toHaveLength(1)
    expect(hidden.sent).toHaveLength(0)
  })

  it('still sends the navigate message when focus() is refused', async () => {
    const sw = setup(HEALTHY)
    const open = windowClient()
    open.focus.mockRejectedValueOnce(new DOMException('Not allowed', 'NotAllowedError'))
    sw.setWindows([open])
    await click(sw, notificationData())
    expect(open.sent).toEqual([{ type: 'navigate', url: '/log/dp-000064' }])
  })

  it.each([['the body', ''], ['the open action', 'open'], ['an action the sender made up', 'snooze']])('a click on %s opens the url', async (_name, action) => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    await click(sw, notificationData(), action)
    expect(sw.openWindow).toHaveBeenCalledWith('/log/dp-000064')
  })

  it('opens "/" when the stored url is on another site or not a url', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    await click(sw, notificationData({ url: 'https://evil.example/x' }))
    await click(sw, notificationData({ url: 'javascript:alert(1)' }))
    await click(sw, undefined)
    expect(sw.openWindow.mock.calls.map((c) => c[0])).toEqual(['/', '/', '/'])
  })
})

describe('the acknowledge action', () => {
  function patchWith(sw: ReturnType<typeof setup>, response: Response | Error) {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    sw.sandbox.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (response instanceof Error) throw response
      return response.clone()
    }) as never
    return calls
  }
  const ok = () => new Response('{"id":"dp-000064","acked":true}', { status: 200, headers: { 'content-type': 'application/json' } })

  it('sends PATCH { acked: true } for the dispatch, opens nothing, and tells the windows to refetch it and the unread count', async () => {
    const sw = setup(HEALTHY)
    const open = windowClient()
    sw.setWindows([open])
    const calls = patchWith(sw, ok())
    await click(sw, notificationData(), 'ack')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('/api/dispatches/dp-000064')
    expect(calls[0]?.init).toMatchObject({ method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"acked":true}' })
    expect(sw.openWindow).not.toHaveBeenCalled()
    // The only messages the window got are the two refetch notices: no `navigate`, and it was not focused.
    expect(open.sent).toEqual([
      { type: 'cache-updated', url: '/api/dispatches/dp-000064' },
      { type: 'cache-updated', url: '/api/inbox/summary' },
    ])
    expect(open.focus).not.toHaveBeenCalled()
  })

  it('opens the app instead when the session has expired (401)', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    patchWith(sw, new Response('{"error":{"code":"unauthorized","message":"No session","requestId":"r"}}', { status: 401 }))
    await click(sw, notificationData(), 'ack')
    expect(sw.openWindow).toHaveBeenCalledWith('/log/dp-000064')
  })

  it('opens the app instead when the network is down, and does not throw', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    patchWith(sw, new TypeError('Failed to fetch'))
    await click(sw, notificationData(), 'ack')
    expect(sw.openWindow).toHaveBeenCalledWith('/log/dp-000064')
  })

  it('opens the app instead when the notification has no dispatch id, without sending anything', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    const calls = patchWith(sw, ok())
    await click(sw, notificationData({ dispatchId: null, url: '/log' }), 'ack')
    expect(calls).toHaveLength(0)
    expect(sw.openWindow).toHaveBeenCalledWith('/log')
  })

  it('encodes the dispatch id in the path', async () => {
    const sw = setup(HEALTHY)
    sw.setWindows([])
    const calls = patchWith(sw, ok())
    await click(sw, notificationData({ dispatchId: 'a/b c' }), 'ack')
    expect(calls[0]?.url).toBe('/api/dispatches/a%2Fb%20c')
  })
})
