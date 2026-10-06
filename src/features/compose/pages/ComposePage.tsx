import { useLocation } from 'react-router'
import { PageHeader } from '@/ui'
import { ComposeForm } from '../components/ComposeForm'
import { ConnectivityStrip } from '../components/ConnectivityStrip'

/** The key a form was started under, carried in router state when the form rewrites its own URL. */
function carriedKey(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('composeKey' in state)) return null
  return typeof state.composeKey === 'string' ? state.composeKey : null
}

/**
 * File a dispatch. Also the target of the manifest shortcut and of "Create dispatch" from the share target, which is
 * why it accepts ?title= &text= &url= &station= and ?draft= . A new navigation here (another link, the nav item)
 * starts a fresh form; the form's own URL rewrite does not.
 */
export default function ComposePage() {
  const location = useLocation()
  const formKey = carriedKey(location.state) ?? location.key
  return (
    <>
      <PageHeader
        eyebrow="Register / File"
        title="File a dispatch"
        description="Write it up as you would in the station log. Every keystroke is kept on this device, so a dead link or a closed tab does not cost you the entry."
        meta={<ConnectivityStrip context="compose" />}
      />
      <ComposeForm key={formKey} formKey={formKey} />
    </>
  )
}
