/**
 * The server's own request log: a ring of the last 500 requests.
 * `seq` only ever grows, even across `clear()`, so a client that remembers the highest seq it has
 * seen can ask for "everything after" without ever mistaking a new entry for an old one.
 */
import type { RequestLogEntry, RequestLogPage } from '../shared/contracts'

export const LOG_RING_SIZE = 500

let lastSeq = 0
let entries: RequestLogEntry[] = []

export const requestLog = {
  /** Assigns the next seq and stores the entry, dropping the oldest beyond the ring size. */
  push(entry: Omit<RequestLogEntry, 'seq'>): RequestLogEntry {
    lastSeq += 1
    const stored: RequestLogEntry = { ...entry, seq: lastSeq }
    entries.push(stored)
    if (entries.length > LOG_RING_SIZE) entries = entries.slice(entries.length - LOG_RING_SIZE)
    return stored
  },

  /** Entries with seq greater than `sinceSeq`, oldest first. */
  since(sinceSeq = 0): RequestLogPage {
    return { entries: entries.filter((e) => e.seq > sinceSeq), lastSeq }
  },

  /** Empties the ring. The seq counter keeps counting. */
  clear(): void {
    entries = []
  },

  get lastSeq(): number {
    return lastSeq
  },
}
