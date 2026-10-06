import { asString, check, inScope, resolveUrl } from './manifest-helpers'
import type { CheckContext, ManifestCheck } from './manifest-load'
import { checkIcons, checkScreenshots } from './manifest-rules-assets'
import { checkLaunchHandler, checkProtocolHandlers, checkShareTarget, checkShortcuts } from './manifest-rules-integration'

const INSTALLABLE_DISPLAY = new Set(['standalone', 'fullscreen', 'minimal-ui'])
const ALL_DISPLAY = new Set([...INSTALLABLE_DISPLAY, 'browser'])

/** Scope the browser will use: the declared one, else the directory of the start URL. */
export function effectiveScope(manifest: Record<string, unknown>, ctx: CheckContext): { scope: URL; declared: boolean; start: URL } {
  const start = resolveUrl(manifest.start_url, ctx.manifestUrl) ?? new URL('/', ctx.manifestUrl)
  const declared = resolveUrl(manifest.scope, ctx.manifestUrl)
  return { scope: declared ?? new URL('.', start), declared: declared !== null, start }
}

function checkColors(manifest: Record<string, unknown>): ManifestCheck[] {
  return (['theme_color', 'background_color'] as const).map((key) => {
    const raw = manifest[key]
    if (raw === undefined) {
      return check('Identity', key, key, 'warn', key === 'theme_color' ? 'Missing. The address bar and task switcher fall back to a default; the page <meta name="theme-color"> is used only in the browser.' : 'Missing. The splash screen is white until the page paints.')
    }
    const text = asString(raw)
    if (text === null || (typeof CSS !== 'undefined' && !CSS.supports('color', text))) return check('Identity', key, key, 'fail', `${JSON.stringify(raw)} is not a CSS colour.`)
    return check('Identity', key, key, 'pass', text)
  })
}

function checkIdentity(manifest: Record<string, unknown>): ManifestCheck[] {
  const name = asString(manifest.name)
  const shortName = asString(manifest.short_name)
  return [
    name
      ? check('Identity', 'name', 'name', 'pass', name)
      : check('Identity', 'name', 'name', shortName ? 'warn' : 'fail', shortName ? 'Missing. Browsers fall back to short_name, but the install dialog is meant to show name.' : 'Missing, and there is no short_name either. Chrome will not treat the app as installable.'),
    !shortName
      ? check('Identity', 'short_name', 'short_name', 'warn', 'Missing. Home screens and launchers show the full name and truncate it.')
      : shortName.length > 12
        ? check('Identity', 'short_name', 'short_name', 'warn', `"${shortName}" is ${shortName.length} characters. Launchers cut labels at about 12.`)
        : check('Identity', 'short_name', 'short_name', 'pass', shortName),
    ...checkColors(manifest),
  ]
}

function checkLaunch(manifest: Record<string, unknown>, ctx: CheckContext): ManifestCheck[] {
  const out: ManifestCheck[] = []
  const { scope, declared, start } = effectiveScope(manifest, ctx)

  if (manifest.start_url === undefined) out.push(check('Launch', 'start_url', 'start_url', 'warn', 'Missing. The browser uses the URL of the page that linked the manifest, which changes with whatever page the user was on.'))
  else if (resolveUrl(manifest.start_url, ctx.manifestUrl) === null) out.push(check('Launch', 'start_url', 'start_url', 'fail', `${JSON.stringify(manifest.start_url)} does not parse as a URL.`))
  else if (start.origin !== ctx.pageOrigin) out.push(check('Launch', 'start_url', 'start_url', 'fail', `${start.href} is on another origin.`))
  else out.push(check('Launch', 'start_url', 'start_url', ctx.routeExists(start.pathname) ? 'pass' : 'warn', ctx.routeExists(start.pathname) ? `${start.pathname}${start.search}` : `${start.pathname} is not a route of this app. The installed app would open the not-found page.`))

  if (!declared) out.push(check('Launch', 'scope', 'scope', 'info', `Not declared. The browser uses the start URL's directory: ${scope.pathname}`))
  else if (!inScope(start, scope)) out.push(check('Launch', 'scope', 'scope', 'fail', `start_url ${start.pathname} is outside the scope ${scope.pathname}. Browsers drop the scope and use the default one.`))
  else out.push(check('Launch', 'scope', 'scope', 'pass', `${scope.pathname} contains the start URL.`))

  const display = asString(manifest.display)
  if (display === null) out.push(check('Launch', 'display', 'display', 'fail', 'Missing, so it defaults to "browser". Chrome installs only apps that ask for standalone, fullscreen or minimal-ui.'))
  else if (!ALL_DISPLAY.has(display)) out.push(check('Launch', 'display', 'display', 'fail', `"${display}" is not a display mode. window-controls-overlay belongs in display_override, with a display fallback.`))
  else if (!INSTALLABLE_DISPLAY.has(display)) out.push(check('Launch', 'display', 'display', 'fail', '"browser" opens a normal tab. The app is not installable in that mode.'))
  else out.push(check('Launch', 'display', 'display', 'pass', display))

  const id = resolveUrl(manifest.id, ctx.manifestUrl)
  if (manifest.id === undefined) out.push(check('Launch', 'id', 'id', 'warn', `Missing. The app's identity defaults to the start URL (${start.pathname}); change that later and browsers treat it as a different app.`))
  else if (id === null) out.push(check('Launch', 'id', 'id', 'fail', `${JSON.stringify(manifest.id)} does not parse as a URL.`))
  else out.push(check('Launch', 'id', 'id', 'pass', `Resolves to ${id.pathname}${id.search}`))
  return out
}

/** Runs every rule against a parsed manifest. Icon and screenshot URLs are fetched, so this is async. */
export async function runManifestChecks(manifest: Record<string, unknown>, ctx: CheckContext): Promise<ManifestCheck[]> {
  const scopeInfo = effectiveScope(manifest, ctx)
  const [icons, screenshots] = await Promise.all([checkIcons(manifest, ctx), checkScreenshots(manifest, ctx)])
  return [
    ...checkIdentity(manifest),
    ...checkLaunch(manifest, ctx),
    ...icons,
    ...checkShortcuts(manifest, ctx, scopeInfo.scope),
    ...checkShareTarget(manifest, ctx, scopeInfo.scope),
    ...checkProtocolHandlers(manifest, ctx),
    ...checkLaunchHandler(manifest),
    ...screenshots,
  ]
}
