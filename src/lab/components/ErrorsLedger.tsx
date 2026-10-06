import { Plate } from '@/ui'
import { ErrorsKindStamp } from './ErrorsKindStamp'
import { ERROR_LAYERS } from './ErrorsLayers'
import styles from './ErrorsLedger.module.css'

/** Six places in the code classify or file a failure. They are not nested: each owns one route a failure can take. */
export function ErrorsLedger() {
  return (
    <Plate index={4} title="Where errors are handled">
      <p className={styles.lede}>
        Six places in the code turn a failure into an AppError, file it, or both. A failed request passes through the first two. A crash while drawing meets the third, or the fourth when it happens inside a route. What escapes
        everything lands in the fifth, and the sixth guards the door to <code>src/pwa</code>. The kinds are the ones a layer can pass on. Each row names its file.
      </p>
      <ol className={styles.list}>
        {ERROR_LAYERS.map((layer, i) => (
          <li key={layer.id} className={styles.layer}>
            <header className={styles.head}>
              <span className={styles.no}>{String(i + 1).padStart(2, '0')}</span>
              <div className={styles.title}>
                <h3 className={styles.name}>{layer.name}</h3>
                <code className={styles.where}>{layer.where}</code>
              </div>
            </header>
            <dl className={styles.facts}>
              <div>
                <dt>Catches</dt>
                <dd>{layer.catches}</dd>
              </div>
              <div>
                <dt>Then</dt>
                <dd>{layer.then}</dd>
              </div>
              <div>
                <dt>Misses</dt>
                <dd>{layer.misses}</dd>
              </div>
            </dl>
            <ul className={styles.kinds} aria-label={`Kinds ${layer.name} can pass on`}>
              {layer.kinds.map((kind) => (
                <li key={kind}>
                  <ErrorsKindStamp kind={kind} size="sm" />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </Plate>
  )
}
