import { LAB_SETTING_DEFAULTS, useLabSettings, usePersistStatus } from '@/lib'
import { Button, Plate } from '@/ui'
import { QuerySettingRow } from './QuerySettingRow'
import { SETTING_DEFS } from './QuerySettingsDefs'
import styles from './QuerySettings.module.css'

/** Every lab setting that shapes the data layer, bound to the real store. Changes apply live except where the row says reload. */
export function QuerySettings() {
  const settings = useLabSettings()
  const loadedWithPersist = usePersistStatus((s) => s.enabled)
  const changed = SETTING_DEFS.filter((d) => settings[d.key] !== LAB_SETTING_DEFAULTS[d.key]).length
  const needsReload = settings.persistQueryCache !== loadedWithPersist

  return (
    <Plate
      index={3}
      title="Settings"
      actions={
        <>
          {needsReload ? (
            <Button size="sm" variant="primary" icon="refresh" onClick={() => window.location.reload()}>
              Reload to apply
            </Button>
          ) : null}
          <Button size="sm" icon="arrow-left" disabled={changed === 0} onClick={() => useLabSettings.getState().reset()}>
            Reset to defaults
          </Button>
        </>
      }
    >
      <p className={styles.lede}>
        {changed === 0 ? 'Every value is at its default.' : `${changed} of ${SETTING_DEFS.length} values differ from the defaults.`} These are stored in this browser only and shared between your tabs. Stale time, keep time, network mode,
        retries and focus refetching are pushed into the live query client the moment you change them.
      </p>
      <ul className={styles.list}>
        {SETTING_DEFS.map((def) => (
          <QuerySettingRow key={def.key} def={def} value={settings[def.key]} loadedWith={loadedWithPersist} />
        ))}
      </ul>
    </Plate>
  )
}
