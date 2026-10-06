import { isRecord, type CheckContext, type ManifestCheck, type ProbeResult } from './manifest-load'
import { asString, check, resolveUrl } from './manifest-helpers'

const sizesOf = (icon: Record<string, unknown>): string[] => (asString(icon.sizes) ?? '').toLowerCase().split(/\s+/).filter(Boolean)
const purposesOf = (icon: Record<string, unknown>): string[] => (asString(icon.purpose) ?? 'any').toLowerCase().split(/\s+/).filter(Boolean)

function describeProbe(result: ProbeResult, wantImage: boolean): { ok: boolean; text: string } {
  if (result.outcome === 'skipped') return { ok: true, text: 'cross-origin, not fetched' }
  if (result.outcome === 'network') return { ok: false, text: 'the request failed' }
  if (result.outcome === 'http-error') return { ok: false, text: `${result.status}` }
  if (wantImage && !(result.contentType ?? '').startsWith('image/')) return { ok: false, text: `${result.status} but the content type is ${result.contentType ?? 'missing'}, not an image` }
  return { ok: true, text: `${result.status} ${result.contentType ?? ''}`.trim() }
}

/** Reachability of one image member, as a check. */
async function checkImage(entry: unknown, label: string, id: string, ctx: CheckContext): Promise<ManifestCheck> {
  const src = isRecord(entry) ? resolveUrl(entry.src, ctx.manifestUrl) : null
  if (!src) return check('Icons', id, label, 'fail', 'Has no usable src.')
  const { ok, text } = describeProbe(await ctx.probe(src), true)
  return check('Icons', id, label, ok ? 'pass' : 'fail', `${src.pathname}${src.search}: ${text}`)
}

export async function checkIcons(manifest: Record<string, unknown>, ctx: CheckContext): Promise<ManifestCheck[]> {
  const raw = manifest.icons
  if (!Array.isArray(raw) || raw.length === 0) return [check('Icons', 'icons', 'icons', 'fail', 'Missing or empty. Installability needs at least a 192 px and a 512 px icon.')]
  const icons = raw.filter(isRecord)
  const has = (size: string, purpose: string): boolean => icons.some((i) => (sizesOf(i).includes(size) || sizesOf(i).includes('any')) && purposesOf(i).includes(purpose))
  const out: ManifestCheck[] = [
    check('Icons', 'icon-192', 'icon 192x192', has('192x192', 'any') ? 'pass' : 'fail', has('192x192', 'any') ? 'Declared with purpose "any".' : 'No icon declares sizes "192x192" with purpose "any".'),
    check('Icons', 'icon-512', 'icon 512x512', has('512x512', 'any') ? 'pass' : 'fail', has('512x512', 'any') ? 'Declared with purpose "any".' : 'No icon declares sizes "512x512" with purpose "any".'),
    icons.some((i) => purposesOf(i).includes('maskable'))
      ? check('Icons', 'icon-maskable', 'maskable icon', 'pass', 'At least one icon is maskable, so Android can crop it to the launcher shape.')
      : check('Icons', 'icon-maskable', 'maskable icon', 'warn', 'None. Android puts a plain icon on a white disc instead of filling the shape.'),
  ]
  const combined = icons.filter((i) => purposesOf(i).includes('maskable') && purposesOf(i).includes('any'))
  if (combined.length > 0) out.push(check('Icons', 'icon-combined', 'purpose "any maskable"', 'warn', 'One icon serves both. A maskable image has a safe-zone margin that looks oversized as a plain icon; ship two files.'))
  const reach = await Promise.all(icons.map((icon, i) => checkImage(icon, `icon #${i + 1} reachable`, `icon-reach-${i}`, ctx)))
  return [...out, ...reach]
}

export async function checkScreenshots(manifest: Record<string, unknown>, ctx: CheckContext): Promise<ManifestCheck[]> {
  const raw = manifest.screenshots
  if (!Array.isArray(raw) || raw.length === 0) {
    return [check('Icons', 'screenshots', 'screenshots', 'info', 'None. Optional, but Chrome shows the richer install dialog only when at least one is declared (wide for desktop, narrow for mobile).')]
  }
  const shots = await Promise.all(raw.map((s, i) => checkImage(s, `screenshot #${i + 1} reachable`, `shot-${i}`, ctx)))
  return [check('Icons', 'screenshots', 'screenshots', 'pass', `${raw.length} declared.`), ...shots]
}
