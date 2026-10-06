import { useState } from 'react'
import { probeNow, useNetStatus } from '@/lib'
import { Button, LinkButton, TimeAgo, formatClock } from '@/ui'
import { useLastContact } from '../browser-state'
import { Banner } from './Banner'

function LastContact({ at }: { at: number | null }) {
  if (at === null) return <>No contact with the relay yet on this page load.</>
  return (
    <>
      Last contact with the relay at <time dateTime={new Date(at).toISOString()}>{formatClock(at)}</time> (<TimeAgo at={at} />).
    </>
  )
}

/** Browser offline, or "online" while the relay is silent (lie-fi). Both name the last time the relay answered. */
export function OfflineBanner() {
  const { browserOnline, lieFi } = useNetStatus()
  const contactAt = useLastContact((s) => s.at)
  const [checking, setChecking] = useState(false)

  if (browserOnline && !lieFi) return null

  const check = (): void => {
    setChecking(true)
    void probeNow().finally(() => setChecking(false))
  }
  const actions = (
    <>
      <Button size="sm" icon="refresh" loading={checking} onClick={check}>
        Check now
      </Button>
      <LinkButton size="sm" variant="quiet" to="/offline">
        What works
      </LinkButton>
    </>
  )

  if (!browserOnline) {
    return (
      <Banner tone="warn" icon="offline" title="No signal" actions={actions}>
        This device reports no network. Screens already open keep working, along with anything held in memory or in a cache. Whatever has to reach the relay (filing, acknowledging, refreshing) will fail
        or wait. <LastContact at={contactAt} />
      </Banner>
    )
  }
  return (
    <Banner tone="error" icon="offline" title="Lie-fi: connected, but nothing answers" actions={actions}>
      The browser says it is online and the relay is not answering. Requests will hang until they time out or fail outright, and navigator.onLine will keep saying true. Treat it as offline. <LastContact at={contactAt} />
    </Banner>
  )
}
