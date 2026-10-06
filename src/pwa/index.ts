import { badge } from './badge'
import { install } from './install'
import { notifications } from './notifications'
import { periodicSync } from './periodic-sync'
import { registration } from './registration'
import { share } from './share'
import { sync } from './sync'
import type { PwaApi } from './types'

export const pwa: PwaApi = { registration, install, notifications, sync, periodicSync, badge, share }

export { bootPwa } from './boot'
export { PwaNotImplementedError } from './errors'
export { setPwa, usePwaStore } from './store'
export type * from './types'
