/**
 * Generated contour-map art for dispatches and stations.
 * Two inks only (ink on paper, flare for the marker), literal colours so the SVG still
 * looks right when it is loaded through <img> or cached and replayed out of context.
 * Everything is a pure function of the seed: same id, same sheet, byte for byte.
 */
import { hashString, mulberry32 } from './util'

const W = 640
const H = 360
const INK = '#17150F'
const PAPER = '#ECE6D6'
const FLARE = '#E2461C'
const MONO = "ui-monospace, 'Spline Sans Mono', Menlo, Consolas, monospace"

export interface ArtSpec {
  variant: 'dispatch' | 'station'
  /** Seeds the terrain: dispatch id or station code. */
  seed: string
  /** Sheet number printed bottom-left, e.g. '№ 0142' or 'KRN-07'. */
  index: string
  /** Second line under the index. */
  caption: string
}

interface Pt {
  x: number
  y: number
}

const TAU = Math.PI * 2
const RING_COUNT = 10
const INDEX_EVERY = 4 // every fourth contour is an index contour: heavier, carries an elevation label
const FLARE_RING = 4

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Closed, smooth contour through `pts` as a relative quadratic path: the points are control
 * points, the curve passes through the midpoints between them (so it is tangent-continuous).
 * Coordinates are rounded to integers on the absolute grid first, which keeps the path
 * short (the whole sheet stays around 5 KB) and closes exactly.
 */
function smoothClosedPath(pts: Pt[]): string {
  const n = pts.length
  const mid = (i: number): Pt => {
    const a = pts[i % n] as Pt
    const b = pts[(i + 1) % n] as Pt
    return { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) }
  }
  let prev = mid(n - 1)
  let d = `M${prev.x} ${prev.y}`
  for (let i = 0; i < n; i++) {
    const control = pts[i] as Pt
    const end = mid(i)
    d += `q${Math.round(control.x) - prev.x} ${Math.round(control.y) - prev.y} ${end.x - prev.x} ${end.y - prev.y}`
    prev = end
  }
  return `${d}z`
}

interface Terrain {
  cx: number
  cy: number
  rng: () => number
  stepPx: number
  squashX: number
  squashY: number
  rotation: number
  driftX: number
  driftY: number
  phases: number[]
  amps: number[]
}

function makeTerrain(seed: string): Terrain {
  const rng = mulberry32(hashString(`contour:${seed}`))
  return {
    cx: 190 + rng() * 260,
    cy: 120 + rng() * 120,
    rng,
    stepPx: 23 + rng() * 7,
    squashX: 1.2 + rng() * 0.45,
    squashY: 0.78 + rng() * 0.2,
    rotation: (rng() - 0.5) * 1.2,
    driftX: (rng() - 0.5) * 7,
    driftY: (rng() - 0.5) * 5,
    phases: [rng() * TAU, rng() * TAU, rng() * TAU, rng() * TAU],
    amps: [0.05 + rng() * 0.07, 0.04 + rng() * 0.06, 0.02 + rng() * 0.04, 0.012 + rng() * 0.025],
  }
}

/** Ring k as control points. Outer rings wobble more, like ground that flattens towards the valley. */
function ringPoints(t: Terrain, k: number): Pt[] {
  const radius = 9 + k * t.stepPx
  const roughness = 0.35 + (k / RING_COUNT) * 0.9
  const segments = 16 + Math.floor(k * 0.7)
  const cos = Math.cos(t.rotation)
  const sin = Math.sin(t.rotation)
  const pts: Pt[] = []
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * TAU
    let wobble = 1
    for (let h = 0; h < t.amps.length; h++) {
      // The phase creeps with k so neighbouring contours stay nested instead of crossing.
      wobble += (t.amps[h] as number) * roughness * Math.sin((h + 2) * theta + (t.phases[h] as number) + k * 0.06 * (h + 1))
    }
    const rx = radius * wobble * Math.cos(theta) * t.squashX
    const ry = radius * wobble * Math.sin(theta) * t.squashY
    pts.push({ x: t.cx + t.driftX * k + rx * cos - ry * sin, y: t.cy + t.driftY * k + rx * sin + ry * cos })
  }
  return pts
}

const inside = (p: Pt): boolean => p.x > 40 && p.x < W - 40 && p.y > 34 && p.y < H - 70

export function renderArt(spec: ArtSpec): string {
  const t = makeTerrain(spec.seed)
  const baseElevation = 120 + Math.floor(t.rng() * 38) * 20

  const rings: string[] = []
  const labels: string[] = []
  for (let k = 0; k < RING_COUNT; k++) {
    const pts = ringPoints(t, k)
    const isIndex = k % INDEX_EVERY === INDEX_EVERY - 1
    const isFlare = k === FLARE_RING
    const stroke = isFlare ? FLARE : INK
    const width = isFlare ? 2.2 : isIndex ? 1.7 : 0.8
    rings.push(`<path d="${smoothClosedPath(pts)}" stroke="${stroke}" stroke-width="${width}"/>`)
    if (isIndex) {
      // Elevation label sits on the contour, on a paper-coloured patch that interrupts the line.
      const at = pts.find((p, i) => i >= pts.length / 6 && inside(p)) ?? pts.find(inside)
      if (at) {
        const text = String(baseElevation + (RING_COUNT - k) * 20)
        const x = Math.round(at.x)
        const y = Math.round(at.y)
        labels.push(`<rect x="${x - 15}" y="${y - 7}" width="30" height="13" fill="${PAPER}"/><text x="${x}" y="${y + 3}" text-anchor="middle">${text}</text>`)
      }
    }
  }

  const cx = Math.round(t.cx)
  const cy = Math.round(t.cy)
  let overlay = ''
  if (spec.variant === 'dispatch') {
    // Bearing line from the marker out to the sheet edge, like a survey sight line.
    const angle = t.rng() * TAU
    const far = 420
    const x2 = Math.round(cx + Math.cos(angle) * far)
    const y2 = Math.round(cy + Math.sin(angle) * far)
    overlay = `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="${FLARE}" stroke-width="1.2" stroke-dasharray="7 5"/>`
  } else {
    // Station sheets get a bezel of degree ticks around the marker.
    overlay = `<circle cx="${cx}" cy="${cy}" r="30" fill="none" stroke="${INK}" stroke-width="5" stroke-dasharray="1.2 4.6"/><circle cx="${cx}" cy="${cy}" r="25" fill="none" stroke="${INK}" stroke-width="1"/>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Contour sheet ${escapeXml(spec.index)}" font-family="${MONO}">
<defs>
<pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="${INK}" stroke-opacity=".13" stroke-width=".7"/></pattern>
<pattern id="G" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0H0V100" fill="none" stroke="${INK}" stroke-opacity=".3" stroke-width=".9"/></pattern>
<pattern id="t" width="16" height="10" patternUnits="userSpaceOnUse"><path d="M0 0V4" stroke="${INK}" stroke-width="1"/></pattern>
<pattern id="T" width="80" height="10" patternUnits="userSpaceOnUse"><path d="M0 0V9" stroke="${INK}" stroke-width="1.5"/></pattern>
<pattern id="l" width="10" height="16" patternUnits="userSpaceOnUse"><path d="M0 0H4" stroke="${INK}" stroke-width="1"/></pattern>
<pattern id="L" width="10" height="80" patternUnits="userSpaceOnUse"><path d="M0 0H9" stroke="${INK}" stroke-width="1.5"/></pattern>
<clipPath id="c"><rect x="14" y="14" width="${W - 28}" height="${H - 28}"/></clipPath>
</defs>
<rect width="${W}" height="${H}" fill="${PAPER}"/>
<rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="url(#g)"/>
<rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="url(#G)"/>
<g clip-path="url(#c)" fill="none" stroke-linejoin="round">
${rings.join('\n')}
${overlay}
</g>
<g font-size="9" fill="${INK}">${labels.join('')}</g>
<circle cx="${cx}" cy="${cy}" r="11" fill="${PAPER}" stroke="${FLARE}" stroke-width="2"/>
<circle cx="${cx}" cy="${cy}" r="4.5" fill="${FLARE}"/>
<path d="M${cx - 18} ${cy}h10M${cx + 8} ${cy}h10M${cx} ${cy - 18}v10M${cx} ${cy + 8}v10" stroke="${FLARE}" stroke-width="1.2"/>
<rect x="9" y="9" width="${W - 18}" height="10" fill="url(#t)"/>
<rect x="9" y="9" width="${W - 18}" height="10" fill="url(#T)"/>
<rect x="9" y="9" width="10" height="${H - 18}" fill="url(#l)"/>
<rect x="9" y="9" width="10" height="${H - 18}" fill="url(#L)"/>
<rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="none" stroke="${INK}" stroke-width="1.5"/>
<path d="M8 24V8h16M${W - 24} 8h16v16M${W - 8} ${H - 24}v16h-16M24 ${H - 8}H8v-16" fill="none" stroke="${INK}" stroke-width="3.5"/>
<rect x="26" y="${H - 52}" width="214" height="28" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>
<text x="34" y="${H - 38}" font-size="14" font-weight="700" letter-spacing="1" fill="${INK}">${escapeXml(spec.index)}</text>
<text x="34" y="${H - 28}" font-size="8" letter-spacing=".8" fill="${INK}">${escapeXml(spec.caption.toUpperCase().slice(0, 34))}</text>
<path d="M${W - 130} ${H - 30}h100M${W - 130} ${H - 35}v10M${W - 80} ${H - 33}v6M${W - 30} ${H - 35}v10" stroke="${INK}" stroke-width="1.5" fill="none"/>
<text x="${W - 130}" y="${H - 40}" font-size="8" fill="${INK}">0</text>
<text x="${W - 30}" y="${H - 40}" font-size="8" text-anchor="end" fill="${INK}">1 KM</text>
</svg>
`
}
