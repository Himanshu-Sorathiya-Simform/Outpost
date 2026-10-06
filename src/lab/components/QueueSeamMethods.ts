/** Every method of the seam, in the order the exercises meet them. `feature` is the name the website passes to callSeam. */
export interface SeamMethod {
  feature: string
  /** The file the learner edits to make it answer. */
  file: string
  /** True when the stub already answers: it only reads a browser capability, or (boot) does nothing and does not throw. */
  answersEarly?: boolean
}

export const SEAM_METHODS: readonly SeamMethod[] = [
  { feature: 'boot', file: 'src/pwa/boot.ts', answersEarly: true },
  { feature: 'registration.register', file: 'src/pwa/registration.ts' },
  { feature: 'registration.unregister', file: 'src/pwa/registration.ts' },
  { feature: 'registration.checkForUpdate', file: 'src/pwa/registration.ts' },
  { feature: 'registration.applyUpdate', file: 'src/pwa/registration.ts' },
  { feature: 'install.prompt', file: 'src/pwa/install.ts' },
  { feature: 'notifications.permission', file: 'src/pwa/notifications.ts', answersEarly: true },
  { feature: 'notifications.requestPermission', file: 'src/pwa/notifications.ts' },
  { feature: 'notifications.subscribePush', file: 'src/pwa/notifications.ts' },
  { feature: 'notifications.unsubscribePush', file: 'src/pwa/notifications.ts' },
  { feature: 'notifications.getSubscription', file: 'src/pwa/notifications.ts' },
  { feature: 'notifications.showLocal', file: 'src/pwa/notifications.ts' },
  { feature: 'sync.queueDispatch', file: 'src/pwa/sync.ts' },
  { feature: 'sync.listQueued', file: 'src/pwa/sync.ts' },
  { feature: 'sync.removeQueued', file: 'src/pwa/sync.ts' },
  { feature: 'sync.flushNow', file: 'src/pwa/sync.ts' },
  { feature: 'periodicSync.isSupported', file: 'src/pwa/periodic-sync.ts', answersEarly: true },
  { feature: 'periodicSync.register', file: 'src/pwa/periodic-sync.ts' },
  { feature: 'periodicSync.unregister', file: 'src/pwa/periodic-sync.ts' },
  { feature: 'periodicSync.list', file: 'src/pwa/periodic-sync.ts' },
  { feature: 'badge.set', file: 'src/pwa/badge.ts' },
  { feature: 'badge.clear', file: 'src/pwa/badge.ts' },
  { feature: 'share.canShare', file: 'src/pwa/share.ts', answersEarly: true },
  { feature: 'share.share', file: 'src/pwa/share.ts' },
]

/** The area of a feature name: 'badge.set' -> 'badge', 'boot' -> 'boot'. */
export const areaOf = (feature: string): string => feature.split('.')[0] ?? feature

export const AREAS: readonly string[] = [...new Set(SEAM_METHODS.map((m) => areaOf(m.feature)))]
