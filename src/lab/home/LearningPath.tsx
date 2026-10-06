import { Link } from 'react-router'
import { Checkbox, Meter, Plate } from '@/ui'
import { EXERCISES, useLearningPath } from './learning-path'
import styles from './LabHome.module.css'

/** Fifteen exercises, in the order that teaches the most. Ticks are kept in this browser's local storage. */
export function LearningPath() {
  const done = useLearningPath((s) => s.done)
  const set = useLearningPath((s) => s.set)
  const toggle = (no: number, checked: boolean): void => set({ done: checked ? [...new Set([...done, no])] : done.filter((n) => n !== no) })

  return (
    <Plate
      index="Nº 0003"
      title="Learning path"
      actions={<Meter label="Done" hideHeader value={done.length} max={EXERCISES.length} segments={EXERCISES.length} size="sm" tone="accent" valueText={`${done.length} of ${EXERCISES.length}`} className={styles.meter} />}
    >
      <p className={styles.lede}>
        The site works as an ordinary website. Each entry below makes one part of it behave like an app. Edit the files named, then watch the instrument beside it.
        <span className={styles.count} role="status" aria-live="polite">
          {done.length} of {EXERCISES.length} done.
        </span>
      </p>
      <ol className={styles.path}>
        {EXERCISES.map((x) => {
          const checked = done.includes(x.no)
          return (
            <li key={x.no} className={styles.exercise}>
              <span className={styles.exerciseNo} aria-hidden="true">
                {String(x.no).padStart(2, '0')}
              </span>
              <div className={styles.exerciseBody}>
                <Checkbox label={x.title} checked={checked} onChange={(e) => toggle(x.no, e.target.checked)} />
                <p className={styles.exerciseNote}>{x.note}</p>
                <p className={styles.exerciseMeta}>
                  <span className="label">Edit</span> {x.edit.map((f) => (
                    <code key={f}>{f}</code>
                  ))}
                  <span className="label">Watch</span> <Link to={x.watch.to}>{x.watch.label}</Link>
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </Plate>
  )
}
