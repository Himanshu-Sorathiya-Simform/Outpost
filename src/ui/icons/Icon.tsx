import { forwardRef, type SVGProps } from 'react'
import { ICONS, type IconDef, type IconName } from './icon-paths'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'children' | 'viewBox'> {
  name: IconName
  /** Pixel size. The 20px grid scales linearly, stroke included. */
  size?: number
  /** Accessible name. Without it the icon is decorative (aria-hidden). */
  title?: string
  /** Fill the outline with currentColor: starred, flagged, active states. */
  filled?: boolean
}

export const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon({ name, size = 20, title, filled = false, ...rest }, ref) {
  const def: IconDef = ICONS[name]
  return (
    <svg
      ref={ref}
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="butt"
      strokeLinejoin="miter"
      strokeMiterlimit={10}
      focusable="false"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      {...rest}
    >
      {def.s ? <path d={def.s} fill={filled ? 'currentColor' : 'none'} /> : null}
      {def.f ? <path d={def.f} fill="currentColor" stroke="none" /> : null}
    </svg>
  )
})
