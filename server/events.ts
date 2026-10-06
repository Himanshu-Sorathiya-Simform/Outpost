/**
 * Server-sent events hub behind GET /api/_lab/events.
 * Events are sent with an `event:` name equal to `LabEvent.type` and the whole event as JSON in `data:`.
 */
import type { Request, Response } from 'express'
import type { LabEvent, LabState } from '../shared/contracts'
import { store } from './store'

const HEARTBEAT_MS = 15_000
/** A client that stops reading gets dropped rather than letting its buffer grow without bound. */
const MAX_BUFFERED_BYTES = 1_000_000

const clients = new Set<Response>()
let heartbeat: NodeJS.Timeout | null = null

function frame(event: LabEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}

function drop(res: Response): void {
  clients.delete(res)
  if (clients.size === 0 && heartbeat) {
    clearInterval(heartbeat)
    heartbeat = null
  }
}

function write(res: Response, chunk: string): void {
  if (res.writableEnded || res.destroyed) {
    drop(res)
    return
  }
  if (res.writableLength > MAX_BUFFERED_BYTES) {
    res.destroy()
    drop(res)
    return
  }
  res.write(chunk)
}

function startHeartbeat(): void {
  if (heartbeat) return
  // A comment line: ignored by EventSource, but keeps proxies and idle-connection timers from closing the stream.
  heartbeat = setInterval(() => {
    for (const res of clients) write(res, ': heartbeat\n\n')
  }, HEARTBEAT_MS)
  heartbeat.unref()
}

export const events = {
  /** Sends one event to every connected stream. */
  broadcast(event: LabEvent): void {
    if (clients.size === 0) return
    const text = frame(event)
    for (const res of clients) write(res, text)
  },

  /** Express handler: opens a stream, says hello, then sends the full current state. */
  handler(getState: () => LabState) {
    return (req: Request, res: Response): void => {
      req.socket.setNoDelay(true)
      req.socket.setKeepAlive(true)
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        // Tells nginx-style proxies not to buffer the stream.
        'X-Accel-Buffering': 'no',
      })
      // Reconnect delay the browser uses if the stream drops (the app's own feed overrides this with backoff).
      res.write('retry: 3000\n\n')
      clients.add(res)
      startHeartbeat()
      res.on('close', () => drop(res))
      write(res, frame({ type: 'hello', serverInstance: store.serverInstance }))
      write(res, frame({ type: 'state', state: getState() }))
    }
  },

  /** Ends every stream; used before the HTTP server closes so shutdown is not held up by open connections. */
  closeAll(): void {
    for (const res of clients) res.end()
    clients.clear()
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = null
  },

  get clientCount(): number {
    return clients.size
  },
}
