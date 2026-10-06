import type { IconName } from '@/ui'

export interface NavItem {
  to: string
  label: string
  icon: IconName
  /** Match only this exact path (the Lab home must not stay lit on every instrument). */
  end?: boolean
  badge?: 'unread' | 'queue'
}

/** The product. Order is the order in the rail and in the More sheet. */
export const FIELD_NAV: readonly NavItem[] = [
  { to: '/log', label: 'Log', icon: 'log' },
  { to: '/inbox', label: 'Inbox', icon: 'inbox', badge: 'unread' },
  { to: '/file', label: 'File dispatch', icon: 'pen' },
  { to: '/signal', label: 'Signal', icon: 'signal' },
  { to: '/stations', label: 'Stations', icon: 'station' },
  { to: '/handbook', label: 'Handbook', icon: 'book' },
  { to: '/drafts', label: 'Drafts', icon: 'file', badge: 'queue' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

/** The five places the phone tab bar shows. The last slot is "More". */
export const TAB_BAR: readonly string[] = ['/log', '/inbox', '/file', '/signal']
