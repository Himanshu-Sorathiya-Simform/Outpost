import { useVersionStatus } from '@/lib'
import { Button, Dialog } from '@/ui'
import styles from './VersionGate.module.css'

/**
 * The server says this client is older than `minClient`: stop, do not let the operator file against a contract the
 * relay no longer honours. A modal with no close control and no Escape, because the only way out is a newer copy.
 */
export function VersionGate() {
  const { skew, running, server } = useVersionStatus()
  const blocked = skew === 'update-required'
  return (
    <Dialog
      open={blocked}
      onClose={() => undefined}
      dismissible={false}
      role="alertdialog"
      size="sm"
      title="Update required"
      description="The relay no longer accepts this copy of Outpost."
      footer={
        <Button variant="primary" icon="refresh" data-autofocus onClick={() => window.location.reload()}>
          Reload
        </Button>
      }
    >
      <div className={styles.body}>
        <p>
          This tab runs version <strong>{running.version}</strong>. The relay requires at least <strong>{server?.minClient ?? 'a newer version'}</strong>. Filing from this copy is unsafe: the relay may reject or misread what it sends.
        </p>
        <p className={styles.note}>
          Still here after reloading? An old copy is being served from a cache: the browser&rsquo;s HTTP cache, or a service worker holding the previous app shell.
        </p>
      </div>
    </Dialog>
  )
}
