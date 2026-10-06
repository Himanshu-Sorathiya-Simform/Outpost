import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon, type IconName } from './icons'
import { Loader } from './Loader'
import { cx } from './internal/cx'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'quiet'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface StyleOptions {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  loading?: boolean
  pressed?: boolean
  iconOnly?: boolean
}

/** Class list for anything that should look like a Button (a NavLink, a custom anchor). */
export function buttonClass({ variant = 'ghost', size = 'md', block, loading, pressed, iconOnly }: StyleOptions = {}): string {
  return cx(styles.btn, styles[variant], size !== 'md' && styles[size], block && styles.block, loading && styles.loading, pressed && styles.pressed, iconOnly && styles.iconOnly)
}

const iconPx = (size: ButtonSize): number => (size === 'sm' ? 16 : 18)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Keeps the button focusable and its width stable, ignores clicks, and sets aria-busy. */
  loading?: boolean
  icon?: IconName
  iconEnd?: IconName
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'ghost', size = 'md', loading = false, icon, iconEnd, block, className, children, onClick, type = 'button', ...rest },
  ref,
) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>): void => {
    if (loading) {
      e.preventDefault()
      return
    }
    onClick?.(e)
  }
  return (
    <button
      ref={ref}
      type={type}
      className={cx(buttonClass({ variant, size, block, loading }), className)}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      <span className={styles.content}>
        {icon ? <Icon name={icon} size={iconPx(size)} /> : null}
        {children}
        {iconEnd ? <Icon name={iconEnd} size={iconPx(size)} /> : null}
      </span>
      {loading ? (
        <span className={styles.spinner}>
          <Loader label={null} size="sm" decorative />
        </span>
      ) : null}
    </button>
  )
})

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  icon: IconName
  /** Required: icon-only controls have no other accessible name. Also used as the tooltip. */
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
  /** Toggle state; sets aria-pressed and the pressed look. */
  pressed?: boolean
  /** Fill the glyph (starred, flagged). */
  filled?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', pressed, filled, className, type = 'button', title, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(buttonClass({ variant, size, pressed, iconOnly: true }), className)}
      aria-label={label}
      aria-pressed={pressed}
      title={title ?? label}
      {...rest}
    >
      <Icon name={icon} size={iconPx(size) + 2} filled={filled} />
    </button>
  )
})

type LinkTarget = { to: string; href?: never } | { href: string; to?: never }
export type LinkButtonProps = LinkTarget &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'> & {
    variant?: ButtonVariant
    size?: ButtonSize
    icon?: IconName
    iconEnd?: IconName
    block?: boolean
    /** Plain anchor only: open in a new tab with rel="noopener noreferrer". */
    external?: boolean
    children: ReactNode
  }

/** A link that looks like a Button. `to` routes inside the SPA, `href` is a normal anchor. */
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  { variant = 'ghost', size = 'md', icon, iconEnd, block, external, className, children, to, href, ...rest },
  ref,
) {
  const cls = cx(buttonClass({ variant, size, block }), className)
  const inner = (
    <span className={styles.content}>
      {icon ? <Icon name={icon} size={iconPx(size)} /> : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={iconPx(size)} /> : external ? <Icon name="external" size={iconPx(size)} /> : null}
    </span>
  )
  if (to !== undefined) {
    return (
      <Link ref={ref} to={to} className={cls} {...rest}>
        {inner}
      </Link>
    )
  }
  return (
    <a ref={ref} href={href} className={cls} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...rest}>
      {inner}
    </a>
  )
})
