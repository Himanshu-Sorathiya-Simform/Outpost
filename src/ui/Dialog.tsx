import { Modal, type ModalBaseProps } from './Modal'
import styles from './Modal.module.css'

export interface DialogProps extends ModalBaseProps {
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Modal dialog: focus is trapped, the page behind is inert, Esc closes, focus returns to the
 * trigger. Put the primary action in `footer`; mark the control to focus first with data-autofocus.
 */
export function Dialog({ size = 'md', ...props }: DialogProps) {
  return <Modal {...props} variant="dialog" variantClass={`${styles.centered} ${styles[size]}`} />
}
