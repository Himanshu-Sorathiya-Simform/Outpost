/**
 * Renders the Outpost app icons from one SVG source with sharp:
 *   public/icons/icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png (180)
 *
 * Flat ink ground, paper mast, flare beacon. The maskable icon keeps the mark inside the
 * central safe zone (a circle of 40% of the side) so any launcher mask can crop it.
 * No manifest is written here; wiring the icons up is part of the PWA exercise.
 *
 *   npm run icons
 */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const PAPER = '#ece6d6'
const INK = '#17150f'
const FLARE = '#e2461c'

/** The mark on its 32-unit grid: lattice mast, cross braces, ground line, signal brackets, beacon. */
const MARK = `
  <g fill="none" stroke="${PAPER}" stroke-linejoin="miter">
    <path d="M16 8.5L7.85 29M16 8.5L24.15 29" stroke-width="2.75"/>
    <path d="M11.4 20h9.2M9.6 24.25h12.8" stroke-width="2"/>
    <path d="M2.5 29.25h27" stroke-width="2.25"/>
    <path d="M6.75 4.75a13 13 0 0 0 0 7M25.25 4.75a13 13 0 0 1 0 7" stroke-width="1.75"/>
  </g>
  <rect x="13.25" y="3.25" width="5.5" height="5.5" fill="${FLARE}"/>`

/** The mark spans x 2.5..29.5 and y 3.25..29.5 on the 32 grid; centre it and scale so it fills `fraction` of the side. */
function iconSvg(size, fraction) {
  const markSize = 27
  const scale = (size * fraction) / markSize
  const tx = size / 2 - 16 * scale
  const ty = size / 2 - 16.4 * scale
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${INK}"/>
  <g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(4)})">${MARK}</g>
</svg>`
}

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url))
await mkdir(outDir, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192, fraction: 0.72 },
  { file: 'icon-512.png', size: 512, fraction: 0.72 },
  // Mark diagonal must stay inside the 0.8-diameter safe circle: 0.54 of the side is comfortably within it.
  { file: 'maskable-512.png', size: 512, fraction: 0.54 },
  { file: 'apple-touch-icon.png', size: 180, fraction: 0.7 },
]

for (const t of targets) {
  await sharp(Buffer.from(iconSvg(t.size, t.fraction)), { density: 300 })
    .resize(t.size, t.size)
    .flatten({ background: INK })
    .png({ compressionLevel: 9 })
    .toFile(outDir + t.file)
  console.warn(`wrote public/icons/${t.file}`)
}
