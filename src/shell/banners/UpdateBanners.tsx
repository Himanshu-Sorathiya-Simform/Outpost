import { useState } from 'react'
import { useVersionStatus } from '@/lib'
import { usePwaStore } from '@/pwa'
import { Button } from '@/ui'
import { Banner } from './Banner'
import { reloadForUpdate } from './update-now'

const reload = (): void => window.location.reload()

function ReloadButton() {
  return (
    <Button size="sm" variant="primary" icon="refresh" onClick={reload}>
      Reload
    </Button>
  )
}

/** For a newer build: the new worker has to take over, so this does that and then reloads (update-now.ts) instead of only reloading. */
function UpdateButton() {
  const [busy, setBusy] = useState(false)
  const run = (): void => {
    setBusy(true)
    void reloadForUpdate()
  }
  return (
    <Button size="sm" variant="primary" icon="refresh" loading={busy} onClick={run}>
      Reload
    </Button>
  )
}

/**
 * Website-level update signals, separate from the service worker's own update toast:
 * a failed lazy chunk, a newer client announced by the server, a newer build deployed, or an API the client does not speak.
 * Dismissal is remembered per announcement, so a later deploy raises the banner again.
 *
 * The update banner's Reload applies the new worker too (update-now.ts); a plain reload would load the new files under the OLD worker and raise
 * the worker's "Update ready" toast. Once that toast is up (a worker is waiting) the banner steps aside, so one update shows one notice.
 */
export function UpdateBanners() {
  const { running, server, deployed, skew, newDeploy, chunkLoadFailed, apiMismatch } = useVersionStatus()
  const workerWaiting = usePwaStore((s) => s.updateAvailable)
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())
  const dismiss = (key: string) => (): void => setDismissed((prev) => new Set(prev).add(key))

  const updateKey = `update:${server?.latestClient ?? ''}:${deployed?.buildId ?? ''}`
  const showUpdate = (skew === 'update-available' || newDeploy) && !workerWaiting && !dismissed.has(updateKey)
  const apiKey = `api:${apiMismatch ?? ''}`
  const showApi = skew === 'api-mismatch' && !dismissed.has(apiKey)
  const chunkKey = 'chunk'
  const showChunk = chunkLoadFailed && !dismissed.has(chunkKey)

  const fresh = deployed && deployed.buildId !== running.buildId ? `Build ${deployed.buildId}` : null
  const latest = server && skew === 'update-available' ? `Version ${server.latestClient}` : null

  return (
    <>
      {showChunk ? (
        <Banner tone="warn" icon="warning" title="Loading failed" actions={<ReloadButton />} onDismiss={dismiss(chunkKey)}>
          A screen failed to load. A newer version may have replaced it.
        </Banner>
      ) : null}
      {showUpdate ? (
        <Banner tone="info" icon="download" title="A newer version is out" actions={<UpdateButton />} onDismiss={dismiss(updateKey)}>
          {[latest, fresh].filter(Boolean).join(' and ')} {latest && fresh ? 'are' : 'is'} live. This tab is running version {running.version}, build {running.buildId}. Reload to pick it up; unsaved drafts are kept on this device.
        </Banner>
      ) : null}
      {showApi ? (
        <Banner tone="warn" icon="warning" title="The relay speaks a different API" actions={<ReloadButton />} onDismiss={dismiss(apiKey)}>
          The relay answers with API version {apiMismatch}, which this copy was not written for. Some screens may fail to read their data until you reload.
        </Banner>
      ) : null}
    </>
  )
}
