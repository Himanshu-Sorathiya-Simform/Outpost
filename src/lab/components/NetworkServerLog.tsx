import type { RequestLogEntry } from '@shared/contracts'
import { clearLabLog, useLabFeedStore } from '@/lib'
import { useClearServerLog } from '@/lib/queries'
import { SERVER_COLUMNS } from './NetworkColumns'
import { NetworkRawLog } from './NetworkRawLog'
import { useNetworkSession } from './NetworkSession'

const haystack = (s: RequestLogEntry): string => `${s.method} ${s.path} ${s.status} ${s.requestId} ${s.tab ?? ''} ${s.chaos ?? ''} ${s.notes.join(' ')} ${s.dest ?? ''}`
const flag = (s: RequestLogEntry): 'warn' | 'error' | undefined => (s.status === 0 || s.status >= 500 ? 'error' : s.chaos ? 'warn' : undefined)

/** The relay's own request log, live over the event stream: the server's half of the story, including requests no client logged. */
export function NetworkServerLog() {
  const entries = useLabFeedStore((s) => s.serverLog)
  const clear = useClearServerLog()
  const markCleared = useNetworkSession((s) => s.markServerCleared)
  const onClear = (): void =>
    clear.mutate(undefined, {
      onSuccess: () => {
        clearLabLog()
        markCleared()
      },
    })
  return (
    <NetworkRawLog
      rows={entries}
      columns={SERVER_COLUMNS}
      rowKey={(s) => String(s.seq)}
      haystack={haystack}
      flag={flag}
      label="Server request log, newest first"
      caption="Every request the server handled except /api/_lab, including page loads, assets and requests a service worker made on its own. Status 0 means the socket was dropped, hung or abandoned. The last 500 are kept."
      empty="The server has logged nothing since it started or since the log was cleared."
      clearLabel="Clear server log"
      onClear={onClear}
      clearing={clear.isPending}
      clearError={clear.error}
    />
  )
}
