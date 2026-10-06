import type { Coords } from '@shared/contracts'
import { formatCoords } from '../format'
import styles from './Locator.module.css'

const WIDTH = 360
const HEIGHT = 180
const LAT_STEPS = [-60, -30, 0, 30, 60]
const LNG_STEPS = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150]

export interface LocatorProps {
  coords: Coords
}

/**
 * A position plate: the dispatch's coordinates as text, and a crosshair on an empty world graticule (equirectangular,
 * a line every 30 degrees). There are no tiles and nothing is loaded from elsewhere, so it draws offline.
 */
export function Locator({ coords }: LocatorProps) {
  const x = coords.lng + 180
  const y = 90 - coords.lat
  const text = formatCoords(coords)
  return (
    <figure className={styles.figure}>
      <svg className={styles.svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Position ${text} on a world graticule`} preserveAspectRatio="xMidYMid meet">
        <rect className={styles.frame} x="0" y="0" width={WIDTH} height={HEIGHT} />
        {LNG_STEPS.map((lng) => (
          <line key={lng} className={lng === 0 ? styles.axis : styles.grid} x1={lng + 180} y1="0" x2={lng + 180} y2={HEIGHT} />
        ))}
        {LAT_STEPS.map((lat) => (
          <line key={lat} className={lat === 0 ? styles.axis : styles.grid} x1="0" y1={90 - lat} x2={WIDTH} y2={90 - lat} />
        ))}
        <line className={styles.cross} x1={x} y1="0" x2={x} y2={HEIGHT} />
        <line className={styles.cross} x1="0" y1={y} x2={WIDTH} y2={y} />
        <circle className={styles.ring} cx={x} cy={y} r="7" />
        <circle className={styles.dot} cx={x} cy={y} r="2.5" />
      </svg>
      <figcaption className={styles.caption}>
        <span className={styles.coords}>{text}</span>
        <span className={styles.scale}>Equirectangular, 30&deg; grid. No map tiles.</span>
      </figcaption>
    </figure>
  )
}
