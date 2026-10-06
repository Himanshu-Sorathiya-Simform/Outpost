import type { Station } from '@shared/contracts'
import styles from './LocatorMap.module.css'

const W = 320
const H = 200
const LAT_SPAN = 8
const STEPS = [0.5, 1, 2, 5, 10, 15, 20, 30, 45]
/** Two marks closer than this (plot units) cannot both carry a readable label. */
const LABEL_CLEARANCE = 36

export const formatCoords = (lat: number, lng: number): string => `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(3)}° ${lng >= 0 ? 'E' : 'W'}`

const degLabel = (v: number, axis: 'lat' | 'lng'): string => `${Number(Math.abs(v).toFixed(1))}°${axis === 'lat' ? (v >= 0 ? 'N' : 'S') : v >= 0 ? 'E' : 'W'}`

function ticks(min: number, max: number, step: number): number[] {
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(Number(v.toFixed(4)))
  return out
}

export interface LocatorMapProps {
  station: Station
  /** Other stations; any that fall inside the window are plotted as hollow marks. */
  others?: readonly Station[]
}

/**
 * Plain equirectangular plot on a graticule. No tiles, no network: it draws from two numbers and works offline.
 * The window is centred on the station; longitude is squeezed by cos(latitude) so a degree looks as wide as it is.
 */
export function LocatorMap({ station, others = [] }: LocatorMapProps) {
  const ppd = H / LAT_SPAN
  const kx = Math.max(0.15, Math.cos((station.lat * Math.PI) / 180))
  const lngSpan = W / (ppd * kx)
  const minLat = station.lat - LAT_SPAN / 2
  const maxLat = station.lat + LAT_SPAN / 2
  const minLng = station.lng - lngSpan / 2
  const maxLng = station.lng + lngSpan / 2
  const x = (lng: number): number => (lng - minLng) * ppd * kx
  const y = (lat: number): number => (maxLat - lat) * ppd

  const lngStep = STEPS.find((s) => lngSpan / s <= 6) ?? 45
  const latLines = ticks(minLat, maxLat, 2)
  const lngLines = ticks(minLng, maxLng, lngStep)
  const near = others.filter((o) => o.id !== station.id && o.lat > minLat + 0.3 && o.lat < maxLat - 0.3 && o.lng > minLng && o.lng < maxLng)
  const cx = x(station.lng)
  const cy = y(station.lat)
  const flip = cx > W * 0.65
  const placed = near
    .map((o) => ({ o, px: x(o.lng), py: y(o.lat) }))
    .sort((a, b) => Math.hypot(a.px - cx, a.py - cy) - Math.hypot(b.px - cx, b.py - cy))
    .reduce<Array<{ o: Station; px: number; py: number; labelled: boolean }>>((acc, m) => {
      const taken = [{ px: cx, py: cy }, ...acc.filter((p) => p.labelled)]
      const clear = taken.every((t) => Math.hypot(m.px - t.px, m.py - t.py) >= LABEL_CLEARANCE)
      return [...acc, { ...m, labelled: clear }]
    }, [])

  return (
    <svg className={styles.map} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Locator for ${station.code}: ${formatCoords(station.lat, station.lng)}`}>
      <rect className={styles.field} width={W} height={H} />
      {latLines.map((v) => (
        <g key={`lat${v}`}>
          <line className={styles.grat} x1={0} x2={W} y1={y(v)} y2={y(v)} />
          <text className={styles.tick} x={4} y={y(v) - 3}>
            {degLabel(v, 'lat')}
          </text>
        </g>
      ))}
      {lngLines.map((v) => (
        <g key={`lng${v}`}>
          <line className={styles.grat} x1={x(v)} x2={x(v)} y1={0} y2={H} />
          <text className={styles.tick} x={x(v) + 3} y={H - 5}>
            {degLabel(v, 'lng')}
          </text>
        </g>
      ))}
      {placed.map(({ o, px, py, labelled }) => (
        <g key={o.id}>
          <title>{o.code}</title>
          <rect className={styles.other} x={px - 3} y={py - 3} width={6} height={6} />
          {labelled ? (
            <text className={styles.otherLabel} x={px + 6} y={py + 3}>
              {o.code}
            </text>
          ) : null}
        </g>
      ))}
      <line className={styles.cross} x1={cx} x2={cx} y1={0} y2={H} />
      <line className={styles.cross} x1={0} x2={W} y1={cy} y2={cy} />
      <rect className={styles.mark} x={cx - 6} y={cy - 6} width={12} height={12} />
      <rect className={styles.markInner} x={cx - 2} y={cy - 2} width={4} height={4} />
      <text className={styles.label} x={flip ? cx - 11 : cx + 11} y={cy - 9} textAnchor={flip ? 'end' : 'start'}>
        {station.code}
      </text>
      <rect className={styles.frame} x={0.75} y={0.75} width={W - 1.5} height={H - 1.5} />
    </svg>
  )
}
