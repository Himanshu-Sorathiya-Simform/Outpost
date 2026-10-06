import type { ReactNode } from 'react'
import { cx } from '@/ui'
import styles from './Page.module.css'

/**
 * Optional wrapper for a page that wants to be a single element. The shell's <main> already stacks direct children
 * with the page rhythm, so a page may equally return a fragment of sections; use Page when you need a class or a ref.
 */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.page, className)}>{children}</div>
}
