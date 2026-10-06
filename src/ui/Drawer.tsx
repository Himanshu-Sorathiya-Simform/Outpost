import { Modal, type ModalBaseProps } from './Modal'
import styles from './Modal.module.css'

export interface DrawerProps extends ModalBaseProps {
  /** Edge it slides from. On phones a `right` drawer becomes a bottom sheet. */
  side?: 'right' | 'left'
}

/** A modal panel pinned to an edge: filters, detail inspectors, the mobile menu. Same behaviour as Dialog. */
export function Drawer({ side = 'right', ...props }: DrawerProps) {
  return <Modal {...props} variant="drawer" variantClass={`${styles.drawer} ${side === 'left' ? styles.left : styles.right}`} />
}
