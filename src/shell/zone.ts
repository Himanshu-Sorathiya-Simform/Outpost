import { useEffect } from 'react'
import { useLocation } from 'react-router'

export type Zone = 'product' | 'lab'

export const zoneOf = (pathname: string): Zone => (pathname === '/lab' || pathname.startsWith('/lab/') ? 'lab' : 'product')

/** The last place visited in each zone, so flipping the switch returns you to where you were. */
const lastPlace: Record<Zone, string> = { product: '/log', lab: '/lab' }

export const zoneTarget = (zone: Zone): string => lastPlace[zone]

export function useZone(): Zone {
  return zoneOf(useLocation().pathname)
}

/** Remembers the current path for its zone. Mount once in the shell. */
export function useZoneMemory(): void {
  const { pathname, search } = useLocation()
  useEffect(() => {
    lastPlace[zoneOf(pathname)] = pathname + search
  }, [pathname, search])
}
