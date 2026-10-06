import { pwa, usePwaStore, type InstallOutcome } from '@/pwa'
import { Button, Disclosure, KeyValue, Plate, Tag } from '@/ui'
import { ActionNote } from '../ActionNote'
import { BackedBy } from '../BackedBy'
import { detectBrowser, useDisplayMode, type BrowserFamily } from '../device'
import { useSeamAction } from '../use-seam-action'
import styles from './cards.module.css'

const FILE = 'src/pwa/install.ts'

const INSTRUCTIONS: Array<{ family: BrowserFamily; name: string; text: string }> = [
  { family: 'chromium', name: 'Chrome, Edge, Brave (desktop and Android)', text: 'Fires beforeinstallprompt once the manifest, icons and a service worker pass. Until then the address bar shows no install icon and the prompt never arrives. After a dismissal Chrome stays quiet for a while.' },
  { family: 'safari-ios', name: 'Safari on iPhone and iPad', text: 'No install event and no prompt from a page. Share, then Add to Home Screen. The page can only tell that it is running standalone afterwards.' },
  { family: 'safari-mac', name: 'Safari on macOS', text: 'File, Add to Dock. No prompt from a page, no beforeinstallprompt.' },
  { family: 'firefox', name: 'Firefox', text: 'Desktop Firefox does not install web apps. Android Firefox offers Install from its menu, again with no event for the page.' },
]

const OUTCOME_TEXT: Record<InstallOutcome, string> = {
  accepted: 'Accepted. The browser is installing it; standalone turns on when it opens as an app.',
  dismissed: 'Dismissed. Chrome may wait days before offering again.',
  unavailable: 'No install prompt is available to this page right now.',
}

/** Card 4: is this an installed app, can the page offer installation, and what to do when it cannot. */
export function InstallCard() {
  const standalone = usePwaStore((s) => s.standalone)
  const available = usePwaStore((s) => s.installPromptAvailable)
  const mode = useDisplayMode()
  const install = useSeamAction<[], InstallOutcome>('install.prompt', () => pwa.install.prompt())
  const here = detectBrowser()
  const outcome = install.state.value

  return (
    <Plate id="install" index={4} title="Install" actions={<Tag tone={standalone ? 'ok' : 'neutral'}>{standalone ? 'Installed, running as app' : 'Running in a browser tab'}</Tag>}>
      <div className={styles.stack}>
        <BackedBy feature="install" file={FILE}>
          It has to catch beforeinstallprompt, keep the event, and show it when this button is pressed.
        </BackedBy>
        <KeyValue
          dense
          items={[
            { label: 'Display mode', value: mode },
            { label: 'Standalone', value: standalone ? 'yes' : 'no' },
            { label: 'Install prompt stored', value: available ? 'yes' : 'no' },
          ]}
        />
        <div className={styles.rowCenter}>
          <Button variant={available ? 'primary' : 'ghost'} icon="install" loading={install.state.phase === 'running'} disabled={standalone} onClick={() => void install.run()}>
            {standalone ? 'Already installed' : 'Install app'}
          </Button>
          {!standalone && !available ? <p className={styles.hint}>No prompt is stored, so the browser has nothing to show. The button still calls the seam, so you can see what your code answers.</p> : null}
        </div>
        <ActionNote
          state={install.state}
          file={FILE}
          okText={outcome ? OUTCOME_TEXT[outcome] : undefined}
          unsupportedText="This browser has no install event for a page to use. See the notes below."
        />
        <Disclosure summary="Installing in each browser" meta={`this looks like ${INSTRUCTIONS.find((i) => i.family === here)?.name.split(' (')[0] ?? 'unknown'}`} defaultOpen={!standalone && !available}>
          <ul className={styles.stack}>
            {INSTRUCTIONS.map((item) => (
              <li key={item.family} className={styles.prose}>
                <strong>{item.name}</strong>
                {item.family === here ? ' (this browser)' : ''}. {item.text}
              </li>
            ))}
          </ul>
        </Disclosure>
      </div>
    </Plate>
  )
}
