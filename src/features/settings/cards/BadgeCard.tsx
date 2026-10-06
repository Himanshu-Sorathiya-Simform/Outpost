import { useState, type FormEvent } from 'react'
import { useUnreadCount } from '@/features/inbox/useBadgeSync'
import { pwa } from '@/pwa'
import { Button, Field, Input, Plate } from '@/ui'
import { ActionNote } from '../ActionNote'
import { BackedBy } from '../BackedBy'
import { useSeamAction } from '../use-seam-action'
import styles from './cards.module.css'

const FILE = 'src/pwa/badge.ts'
const MAX_BADGE = 99_999

/** Card 7: set the app icon badge by hand. Errors show here because this one is a deliberate click. */
export function BadgeCard() {
  const unread = useUnreadCount()
  const [value, setValue] = useState('3')
  const [invalid, setInvalid] = useState<string | null>(null)
  const set = useSeamAction('badge.set', (n: number) => pwa.badge.set(n))
  const clear = useSeamAction('badge.clear', () => pwa.badge.clear())

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    const n = Number(value)
    if (value.trim() === '' || !Number.isInteger(n) || n < 1 || n > MAX_BADGE) {
      setInvalid(`A whole number from 1 to ${MAX_BADGE}. Use Clear to remove the badge.`)
      return
    }
    setInvalid(null)
    clear.reset()
    void set.run(n)
  }

  return (
    <Plate id="badge" index={7} title="Badge">
      <div className={styles.stack}>
        <BackedBy feature="badge" file={FILE}>
          It wraps setAppBadge and clearAppBadge.
        </BackedBy>
        <form className={styles.row} onSubmit={submit} noValidate>
          <Field label="Test value" error={invalid ?? undefined}>
            <Input type="number" inputMode="numeric" min={1} max={MAX_BADGE} value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" icon="badge" loading={set.state.phase === 'running'}>
            Set badge
          </Button>
          <Button
            icon="x"
            loading={clear.state.phase === 'running'}
            onClick={() => {
              set.reset()
              void clear.run()
            }}
          >
            Clear badge
          </Button>
        </form>
        <ActionNote subject="Set" state={set.state} file={FILE} okText={`Badge set to ${value}.`} unsupportedText="This browser has no Badging API. Installed Chromium apps have it." />
        <ActionNote subject="Clear" state={clear.state} file={FILE} okText="Badge cleared." unsupportedText="This browser has no Badging API. Installed Chromium apps have it." />
        <p className={styles.prose}>
          The app also sets the badge itself, to the unread count{unread === undefined ? '' : ` (now ${unread})`}, each time that count changes. A value set here is replaced the next time it does. The Inbox page shows the two side by side.
        </p>
      </div>
    </Plate>
  )
}
