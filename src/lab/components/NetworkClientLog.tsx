import { useNetLog } from '@/lib'
import type { NetLogEntry } from '@/lib/api/net-log'
import { CLIENT_COLUMNS } from './NetworkColumns'
import { NetworkRawLog } from './NetworkRawLog'

const haystack = (c: NetLogEntry): string => `${c.method} ${c.url} ${c.status} ${c.errorKind ?? ''} ${c.requestId ?? ''} ${c.chaos ?? ''} ${c.source ?? ''}`
const flag = (c: NetLogEntry): 'warn' | 'error' | undefined => (c.status === 0 || c.status >= 500 ? 'error' : c.errorKind ? 'warn' : undefined)

/** Everything this tab's apiFetch did, in the order the browser saw it: the client's half of the story. */
export function NetworkClientLog() {
  const entries = useNetLog((s) => s.entries)
  const clear = useNetLog((s) => s.clear)
  return (
    <NetworkRawLog
      rows={entries}
      columns={CLIENT_COLUMNS}
      rowKey={(c) => String(c.id)}
      haystack={haystack}
      flag={flag}
      label="Client request log, newest first"
      caption="One line per apiFetch call in this tab, success or failure. Status 0 means no response arrived. The last 300 are kept; lab calls are not logged."
      empty="No request has gone through apiFetch in this tab yet."
      clearLabel="Clear client log"
      onClear={clear}
    />
  )
}
