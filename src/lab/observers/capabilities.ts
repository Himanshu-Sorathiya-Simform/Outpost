export type CapabilityStatus = 'supported' | 'partial' | 'unsupported'

export interface Detection {
  status: CapabilityStatus
  /** What the probe saw, or why it came up empty. */
  note: string
}

/** Names navigator.permissions.query understands for the capabilities that have a permission. */
export type PermissionProbe = 'notifications' | 'push' | 'periodic-background-sync' | 'persistent-storage'

export interface Capability {
  id: string
  name: string
  /** The exact expression the probe evaluates, printed in the matrix. */
  method: string
  detect(): Detection
  permission?: PermissionProbe
  /** What Outpost does when this is missing. Checked against the Settings and Drafts code. */
  degrade: string
  /** Static general knowledge. Labelled as such in the page. */
  typicallyIn: string
}

const has = (status: boolean, present: string, absent: string): Detection => (status ? { status: 'supported', note: present } : { status: 'unsupported', note: absent })

const secureHint = (): string => (typeof isSecureContext === 'boolean' && !isSecureContext ? ` This page is not a secure context (${location.origin}), which hides the API.` : '')

function shareDetection(): Detection {
  if (!('share' in navigator)) return { status: 'unsupported', note: `navigator.share is not defined.${secureHint()}` }
  if (typeof navigator.canShare !== 'function') return { status: 'partial', note: 'share() exists but canShare() does not, so files cannot be tested first.' }
  let files = false
  try {
    files = navigator.canShare({ files: [new File(['x'], 'probe.txt', { type: 'text/plain' })] })
  } catch {
    files = false
  }
  return files ? { status: 'supported', note: 'share() and canShare() exist; canShare accepts files.' } : { status: 'partial', note: 'share() exists; canShare({ files }) says no, so text and links only.' }
}

function storageDetection(): Detection {
  if (!('storage' in navigator)) return { status: 'unsupported', note: `navigator.storage is not defined.${secureHint()}` }
  const estimate = typeof navigator.storage.estimate === 'function'
  const persist = typeof navigator.storage.persist === 'function'
  if (estimate && persist) return { status: 'supported', note: 'estimate(), persisted() and persist() exist.' }
  return { status: 'partial', note: `${estimate ? 'estimate()' : 'no estimate()'}, ${persist ? 'persist()' : 'no persist()'}.` }
}

function installDetection(): Detection {
  return 'onbeforeinstallprompt' in window
    ? { status: 'supported', note: 'window.onbeforeinstallprompt is defined. The event still fires only when the browser judges the app installable.' }
    : { status: 'unsupported', note: 'window.onbeforeinstallprompt is not defined. The browser may still install apps through its own menu; script cannot trigger it.' }
}

function launchDetection(): Detection {
  return 'launchQueue' in window
    ? { status: 'partial', note: 'window.launchQueue exists (this is what launch_handler and file_handlers feed). Whether the manifest declares either is only visible in the manifest below.' }
    : { status: 'unsupported', note: 'window.launchQueue is not defined.' }
}

function protocolDetection(): Detection {
  return typeof navigator.registerProtocolHandler === 'function'
    ? { status: 'partial', note: 'navigator.registerProtocolHandler exists (the page API for web+ schemes). The manifest protocol_handlers member has no script-side probe: read the manifest below.' }
    : { status: 'unsupported', note: 'navigator.registerProtocolHandler is not defined. Manifest protocol_handlers has no script-side probe either.' }
}

function pushDetection(): Detection {
  if (!('PushManager' in window)) return { status: 'unsupported', note: `window.PushManager is not defined.${secureHint()}` }
  if (!('serviceWorker' in navigator)) return { status: 'partial', note: 'PushManager exists but there is no service worker container to subscribe through.' }
  return 'Notification' in window ? { status: 'supported', note: 'PushManager, serviceWorker and Notification all exist.' } : { status: 'partial', note: 'PushManager exists; Notification does not, so a push cannot be shown.' }
}

export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'service-worker',
    name: 'Service Worker',
    method: "'serviceWorker' in navigator",
    detect: () => has('serviceWorker' in navigator, 'navigator.serviceWorker is defined.', `navigator.serviceWorker is not defined.${secureHint()}`),
    degrade: 'Runs as an ordinary website. The strip shows "sw none", every registration control reports that there is nothing to act on.',
    typicallyIn: 'Chrome, Edge, Firefox, Safari 11.1+, and every mobile browser that matters',
  },
  {
    id: 'cache-storage',
    name: 'Cache Storage',
    method: "'caches' in window",
    detect: () => has('caches' in window, 'window.caches is defined.', `window.caches is not defined.${secureHint()}`),
    degrade: 'The Caches instrument shows an explanation instead of a list. The site never reads Cache Storage itself; only a worker would.',
    typicallyIn: 'Everywhere service workers are, plus the window scope in secure contexts',
  },
  {
    id: 'push',
    name: 'Push API',
    method: "'PushManager' in window",
    detect: pushDetection,
    permission: 'push',
    degrade: 'Settings disables the enable button and says there is nothing to enable. Nothing else depends on it; the inbox still updates when the page fetches.',
    typicallyIn: 'Chrome, Edge, Firefox, Safari 16+ on macOS, iOS 16.4+ for installed web apps only',
  },
  {
    id: 'notifications',
    name: 'Notifications',
    method: "'Notification' in window",
    detect: () => has('Notification' in window, `Notification.permission is "${'Notification' in window ? Notification.permission : ''}".`, 'window.Notification is not defined. Some mobile browsers only allow it from a service worker.'),
    permission: 'notifications',
    degrade: 'Settings shows the permission as Unsupported and disables the enable and test buttons. In-page toasts carry what a notification would, while a window is open.',
    typicallyIn: 'Desktop Chrome, Edge, Firefox, Safari; Android Chrome (from the worker only); iOS for installed web apps',
  },
  {
    id: 'background-sync',
    name: 'Background Sync',
    method: "'SyncManager' in window",
    detect: () => has('SyncManager' in window, 'window.SyncManager is defined.', 'window.SyncManager is not defined.'),
    degrade: 'A dispatch that fails to send stays in the outbox. Drafts lists it with Retry all, which calls sync.flushNow from the page.',
    typicallyIn: 'Chromium browsers only',
  },
  {
    id: 'periodic-sync',
    name: 'Periodic Background Sync',
    method: "'PeriodicSyncManager' in window",
    detect: () => has('PeriodicSyncManager' in window, 'window.PeriodicSyncManager is defined. It still needs an installed app and enough site engagement.', 'window.PeriodicSyncManager is not defined.'),
    permission: 'periodic-background-sync',
    degrade: 'Settings marks the background refresh card "API missing" and the register action reports that this browser has no Periodic Background Sync.',
    typicallyIn: 'Chromium on desktop and Android, installed apps only',
  },
  {
    id: 'badging',
    name: 'Badging API',
    method: "'setAppBadge' in navigator",
    detect: () => has('setAppBadge' in navigator, 'navigator.setAppBadge is defined.', 'navigator.setAppBadge is not defined.'),
    degrade: 'Nothing visible. The unread count stays in the nav; badge failures go to the bridge log only.',
    typicallyIn: 'Chromium desktop and Android for installed apps, Safari 17+ on macOS for Dock apps, iOS 16.4+ installed',
  },
  {
    id: 'web-share',
    name: 'Web Share (and canShare files)',
    method: "'share' in navigator; navigator.canShare({ files })",
    detect: shareDetection,
    degrade: 'Share buttons fall back to copying the link to the clipboard.',
    typicallyIn: 'Safari, Android Chrome, Windows Chrome/Edge; not Firefox desktop',
  },
  {
    id: 'install-event',
    name: 'Install prompt event',
    method: "'onbeforeinstallprompt' in window",
    detect: installDetection,
    degrade: 'Settings shows that no prompt is stored, says this browser has no install event, and lists how each browser installs by hand.',
    typicallyIn: 'Chromium browsers; Safari and Firefox install through their own menus with no event',
  },
  {
    id: 'storage',
    name: 'Storage estimate and persist',
    method: 'navigator.storage.estimate / persist',
    detect: storageDetection,
    permission: 'persistent-storage',
    degrade: 'Settings prints that the browser does not report a storage estimate.',
    typicallyIn: 'Chromium, Firefox, Safari 15.2+ (estimate values are deliberately coarse in some)',
  },
  {
    id: 'indexeddb',
    name: 'IndexedDB',
    method: "'indexedDB' in window",
    detect: () => has('indexedDB' in window, 'window.indexedDB is defined. Private modes of some browsers still refuse to open a database.', 'window.indexedDB is not defined.'),
    degrade: 'Query persistence and the outbox have nowhere to keep data between visits. The rest of the site runs from memory.',
    typicallyIn: 'Every current browser',
  },
  {
    id: 'broadcast-channel',
    name: 'BroadcastChannel',
    method: "typeof BroadcastChannel === 'function'",
    detect: () => has(typeof BroadcastChannel === 'function', 'BroadcastChannel is a constructor.', 'BroadcastChannel is not defined.'),
    degrade: 'Tab sync falls back to storage events. The worker message bridge simply has one channel fewer.',
    typicallyIn: 'Chromium, Firefox, Safari 15.4+',
  },
  {
    id: 'web-locks',
    name: 'Web Locks',
    method: "'locks' in navigator",
    detect: () => has('locks' in navigator, 'navigator.locks is defined.', `navigator.locks is not defined.${secureHint()}`),
    degrade: 'Not used by the site. It is here because two tabs racing to flush the outbox is the classic reason to want it.',
    typicallyIn: 'Chromium, Firefox 96+, Safari 15.4+',
  },
  {
    id: 'navigation-preload',
    name: 'Navigation Preload',
    method: "'navigationPreload' in ServiceWorkerRegistration.prototype",
    detect: () =>
      has(
        typeof ServiceWorkerRegistration !== 'undefined' && 'navigationPreload' in ServiceWorkerRegistration.prototype,
        'ServiceWorkerRegistration.prototype.navigationPreload is defined.',
        'ServiceWorkerRegistration is missing or has no navigationPreload.',
      ),
    degrade: 'Not used by the site. A worker that enables it simply gets no preload response on engines without it.',
    typicallyIn: 'Chromium, Firefox 99+, Safari 15.4+',
  },
  {
    id: 'wake-lock',
    name: 'Screen Wake Lock',
    method: "'wakeLock' in navigator",
    detect: () => has('wakeLock' in navigator, 'navigator.wakeLock is defined.', `navigator.wakeLock is not defined.${secureHint()}`),
    degrade: 'Not used by the site; the signal board does not hold the screen awake.',
    typicallyIn: 'Chromium, Firefox 126+, Safari 16.4+',
  },
  {
    id: 'network-information',
    name: 'Network Information',
    method: "'connection' in navigator",
    detect: () => has('connection' in navigator, 'navigator.connection is defined. The values are estimates.', 'navigator.connection is not defined.'),
    degrade: 'The runtime facts below print "not reported". Online state comes from the reachability probe, not from this.',
    typicallyIn: 'Chromium only (desktop, Android)',
  },
  {
    id: 'launch-handler',
    name: 'Launch Handler',
    method: "'launchQueue' in window",
    detect: launchDetection,
    degrade: 'Not used by the site. Launches behave as they would for an app without the member.',
    typicallyIn: 'Chromium desktop',
  },
  {
    id: 'wco',
    name: 'Window Controls Overlay',
    method: "'windowControlsOverlay' in navigator",
    detect: () => has('windowControlsOverlay' in navigator, 'navigator.windowControlsOverlay is defined. It only has geometry in an installed app that opted in.', 'navigator.windowControlsOverlay is not defined.'),
    degrade: 'Not used by the site. The telemetry strip sits at the top with no title bar to share.',
    typicallyIn: 'Chromium desktop, installed apps only',
  },
  {
    id: 'file-handling',
    name: 'File Handling',
    method: "'launchQueue' in window (needs manifest file_handlers)",
    detect: launchDetection,
    degrade: 'Not used by the site. Files cannot be opened into the compose screen from the OS.',
    typicallyIn: 'Chromium desktop, installed apps only',
  },
  {
    id: 'protocol-handlers',
    name: 'Protocol Handlers',
    method: 'typeof navigator.registerProtocolHandler',
    detect: protocolDetection,
    degrade: 'web+outpost:// links do nothing outside the app. The /handle route still works when you paste the link into the address bar.',
    typicallyIn: 'Chromium desktop for the manifest member; registerProtocolHandler in Chromium and Firefox',
  },
]

export function detectAll(): Array<{ capability: Capability; detection: Detection }> {
  return CAPABILITIES.map((capability) => {
    try {
      return { capability, detection: capability.detect() }
    } catch (err) {
      return { capability, detection: { status: 'unsupported' as const, note: `Probe threw: ${err instanceof Error ? err.message : String(err)}` } }
    }
  })
}

export type PermissionReading = { state: 'granted' | 'denied' | 'prompt' } | { state: 'unknown'; reason: string }

/** Asks navigator.permissions about one capability. Every browser rejects some of these names; that is an answer too. */
export async function readPermission(name: PermissionProbe): Promise<PermissionReading> {
  if (!('permissions' in navigator) || typeof navigator.permissions.query !== 'function') return { state: 'unknown', reason: 'navigator.permissions is not defined' }
  try {
    const descriptor = name === 'push' ? { name, userVisibleOnly: true } : { name }
    const status = await navigator.permissions.query(descriptor as unknown as PermissionDescriptor)
    return { state: status.state }
  } catch (err) {
    return { state: 'unknown', reason: err instanceof Error ? err.message : String(err) }
  }
}
