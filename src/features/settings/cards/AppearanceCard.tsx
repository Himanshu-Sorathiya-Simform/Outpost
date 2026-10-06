import { resolveTheme, useAppSettings } from '@/lib/settings'
import { Meter, Plate, Segmented, SeverityStamp, Tag, Button } from '@/ui'
import { useMediaQuery } from '../device'
import styles from './cards.module.css'
import preview from './AppearanceCard.module.css'

const THEME_OPTIONS = [
  { value: 'light', label: 'Day', icon: 'sun' },
  { value: 'dark', label: 'Night', icon: 'moon' },
  { value: 'system', label: 'System' },
] as const
const DENSITY_OPTIONS = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
] as const

/** Card 2: theme and density. Both are stored on this device only and applied to the page at once. */
export function AppearanceCard() {
  const theme = useAppSettings((s) => s.theme)
  const density = useAppSettings((s) => s.density)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const resolved = resolveTheme(theme)
  const set = useAppSettings((s) => s.set)

  return (
    <Plate id="appearance" index={2} title="Appearance" actions={<Tag>{resolved === 'dark' ? 'Night watch' : 'Daylight ledger'} now</Tag>}>
      <div className={styles.stack}>
        <div className={styles.row}>
          <Segmented label="Theme" showLabel value={theme} options={[...THEME_OPTIONS]} onChange={(theme) => set({ theme })} />
          <Segmented label="Density" showLabel value={density} options={[...DENSITY_OPTIONS]} onChange={(density) => set({ density })} />
        </div>
        <p className={styles.prose}>
          System follows the device and switches with it. Compact tightens controls and rows; it is easier on a wide desktop and harder on a thumb. Motion follows the device too:{' '}
          {reduced ? 'this one asks for reduced motion, so blinks, tickers and row transitions are switched off.' : 'this one allows motion, which here means stepped blinks and short transitions, nothing eased.'}
        </p>
        <div className={preview.strip} role="img" aria-label="Preview of stamps, tags, a button and a meter in the current theme and density">
          <div className={preview.stamps}>
            <SeverityStamp severity="routine" size="sm" />
            <SeverityStamp severity="notice" size="sm" />
            <SeverityStamp severity="urgent" size="sm" />
            <SeverityStamp severity="critical" size="sm" />
          </div>
          <div className={preview.tags}>
            <Tag tone="ok">Online</Tag>
            <Tag tone="warn">Degraded</Tag>
            <Tag tone="error">Dark</Tag>
            <Tag tone="info">Cached</Tag>
          </div>
          <div className={preview.tail}>
            <Button size="sm" variant="primary" tabIndex={-1}>
              Primary
            </Button>
            <Meter label="Sample" value={14} max={24} segments={24} hideHeader size="sm" className={preview.meter} />
          </div>
        </div>
      </div>
    </Plate>
  )
}
