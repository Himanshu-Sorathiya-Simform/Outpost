import type { Coords } from '@shared/contracts'
import { toAppError } from '@/lib/errors/normalize'
import type { AppError } from '@/lib/errors/app-error'

const FIX_TIMEOUT_MS = 10_000
const round = (n: number): number => Math.round(n * 1e5) / 1e5

/** Geolocation reports its own error type; this maps it onto DOMException names that toAppError already knows. */
function fromPositionError(err: GeolocationPositionError): AppError {
  const name = err.code === err.PERMISSION_DENIED ? 'NotAllowedError' : err.code === err.TIMEOUT ? 'TimeoutError' : 'NotSupportedError'
  return toAppError(new DOMException(err.message || 'Position unavailable', name), { source: 'geolocation', code: String(err.code) })
}

/**
 * Where this device says it is. A plain web API, not a PWA one.
 * Rejects with an AppError: `permission` (denied), `unsupported` (no API, or no fix possible), `timeout`.
 */
export function locate(): Promise<Coords> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.reject(toAppError(new DOMException('Geolocation is not available in this browser.', 'NotSupportedError'), { source: 'geolocation' }))
  }
  return new Promise<Coords>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) }),
      (err) => reject(fromPositionError(err)),
      { enableHighAccuracy: false, timeout: FIX_TIMEOUT_MS, maximumAge: 60_000 },
    )
  })
}

/** Inline copy for each way a position request can fail. */
export function locateFailureMessage(error: AppError): string {
  switch (error.kind) {
    case 'permission':
      return 'Location is blocked for this site. Allow it in the browser, or type the coordinates in.'
    case 'timeout':
      return 'No position fix within 10 seconds. Try again outdoors, or type the coordinates in.'
    case 'unsupported':
      return 'This device cannot give a position right now. Type the coordinates in.'
    default:
      return 'Could not read a position. Type the coordinates in.'
  }
}
