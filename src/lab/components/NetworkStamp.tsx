import { cx } from '@/ui'
import { CLASS_NAME, CLASS_STAMP, type NetClass } from './NetworkJoin'
import styles from './NetworkStamp.module.css'

/**
 * A row's class as a rubber stamp. The border style carries the meaning as well as the colour:
 * network = thin, cache = solid, server only = dashed, pre-server fail = double, chaos = inverted slab, no verdict = dotted.
 */
export function NetworkStamp({ cls, className }: { cls: NetClass; className?: string }) {
  return (
    <span className={cx(styles.stamp, styles[cls.replace('-', '_')], className)} title={CLASS_NAME[cls]}>
      {CLASS_STAMP[cls]}
    </span>
  )
}
