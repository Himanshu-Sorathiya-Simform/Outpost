import { useId, useState } from 'react'
import { toAppError } from '@/lib/errors/normalize'
import { Button, Field, Icon, Input } from '@/ui'
import { locate, locateFailureMessage } from '../form/geolocate'
import styles from './CoordsFields.module.css'

export interface CoordsFieldsProps {
  lat: string
  lng: string
  onChange: (next: { lat: string; lng: string }) => void
  error?: string
  latRef: (el: HTMLInputElement | null) => void
}

/** Optional latitude and longitude, typed or read from the device. A failed position request is a line of text here, not a toast. */
export function CoordsFields({ lat, lng, onChange, error, latRef }: CoordsFieldsProps) {
  const errorId = useId()
  const [locating, setLocating] = useState(false)
  const [outcome, setOutcome] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  const fillFromDevice = (): void => {
    setLocating(true)
    setOutcome(null)
    locate().then(
      (here) => {
        onChange({ lat: String(here.lat), lng: String(here.lng) })
        setOutcome({ tone: 'ok', text: 'Position filled in from this device. Check it before filing.' })
        setLocating(false)
      },
      (thrown: unknown) => {
        setOutcome({ tone: 'warn', text: locateFailureMessage(toAppError(thrown, { source: 'geolocation' })) })
        setLocating(false)
      },
    )
  }

  return (
    <fieldset className={styles.set} aria-describedby={error ? errorId : undefined}>
      <legend className={styles.legend}>Coordinates, optional</legend>
      <div className={styles.pair}>
        <Field label="Latitude">
          <Input
            ref={latRef}
            inputMode="decimal"
            value={lat}
            invalid={error !== undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => onChange({ lat: e.target.value, lng })}
            placeholder="61.2181"
            autoComplete="off"
          />
        </Field>
        <Field label="Longitude">
          <Input
            inputMode="decimal"
            value={lng}
            invalid={error !== undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => onChange({ lat, lng: e.target.value })}
            placeholder="-149.9003"
            autoComplete="off"
          />
        </Field>
      </div>
      {error ? (
        <p id={errorId} className={styles.error}>
          <Icon name="warning" size={14} />
          <span>{error}</span>
        </p>
      ) : null}
      <div className={styles.locate}>
        <Button icon="pin" size="sm" loading={locating} onClick={fillFromDevice}>
          Use my position
        </Button>
        <p className={outcome?.tone === 'warn' ? styles.warn : styles.ok} role="status" aria-live="polite">
          {locating ? 'Waiting for a position fix.' : (outcome?.text ?? '')}
        </p>
      </div>
    </fieldset>
  )
}
