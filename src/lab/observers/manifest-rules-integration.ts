import { isRecord, type CheckContext, type ManifestCheck } from './manifest-load'
import { asString, check, inScope, resolveUrl } from './manifest-helpers'

const G = 'Integration' as const

function checkShortcut(entry: unknown, index: number, ctx: CheckContext, scope: URL): ManifestCheck {
  const id = `shortcut-${index}`
  if (!isRecord(entry)) return check(G, id, `shortcut #${index + 1}`, 'fail', 'Not an object.')
  const name = asString(entry.name)
  const url = resolveUrl(entry.url, ctx.manifestUrl)
  const label = `shortcut ${name ?? `#${index + 1}`}`
  if (!name) return check(G, id, label, 'fail', 'Has no name; the launcher menu would show nothing.')
  if (!url) return check(G, id, label, 'fail', 'Has no usable url.')
  if (!inScope(url, scope)) return check(G, id, label, 'fail', `${url.pathname} is outside the scope ${scope.pathname}. Browsers ignore shortcuts that leave the scope.`)
  if (!ctx.routeExists(url.pathname)) return check(G, id, label, 'fail', `${url.pathname} is not a route of this app; it would open the not-found page.`)
  return check(G, id, label, 'pass', `${url.pathname}${url.search} is a route.`)
}

export function checkShortcuts(manifest: Record<string, unknown>, ctx: CheckContext, scope: URL): ManifestCheck[] {
  const raw = manifest.shortcuts
  if (!Array.isArray(raw) || raw.length === 0) return [check(G, 'shortcuts', 'shortcuts', 'info', 'None. Optional. The routes made for them are /file, /inbox and /signal.')]
  return raw.map((entry, i) => checkShortcut(entry, i, ctx, scope))
}

const ENCTYPES = new Set(['application/x-www-form-urlencoded', 'multipart/form-data'])

export function checkShareTarget(manifest: Record<string, unknown>, ctx: CheckContext, scope: URL): ManifestCheck[] {
  const raw = manifest.share_target
  if (raw === undefined) return [check(G, 'share_target', 'share_target', 'info', 'Not declared. Optional. Declare it to appear in the OS share sheet; the landing route is /share-target.')]
  if (!isRecord(raw)) return [check(G, 'share_target', 'share_target', 'fail', 'Not an object.')]
  const out: ManifestCheck[] = []
  const action = resolveUrl(raw.action, ctx.manifestUrl)
  const method = (asString(raw.method) ?? 'GET').toUpperCase()
  const enctype = asString(raw.enctype)
  const params = isRecord(raw.params) ? raw.params : null

  if (!action) out.push(check(G, 'share-action', 'share_target action', 'fail', 'Missing or not a URL.'))
  else if (!inScope(action, scope)) out.push(check(G, 'share-action', 'share_target action', 'fail', `${action.pathname} is outside the scope ${scope.pathname}.`))
  else if (!ctx.routeExists(action.pathname)) out.push(check(G, 'share-action', 'share_target action', 'fail', `${action.pathname} is not a route of this app.`))
  else out.push(check(G, 'share-action', 'share_target action', action.pathname === '/share-target' ? 'pass' : 'warn', action.pathname === '/share-target' ? '/share-target is the route that turns a share into a draft.' : `${action.pathname} exists, but the route built to receive shares is /share-target.`))

  if (method !== 'GET' && method !== 'POST') out.push(check(G, 'share-method', 'share_target method', 'fail', `"${method}" is neither GET nor POST.`))
  else if (method === 'GET' && enctype && enctype !== 'application/x-www-form-urlencoded') out.push(check(G, 'share-method', 'share_target method', 'warn', `GET ignores enctype "${enctype}".`))
  else if (method === 'POST' && enctype && !ENCTYPES.has(enctype)) out.push(check(G, 'share-method', 'share_target method', 'fail', `enctype "${enctype}" is not one of ${[...ENCTYPES].join(', ')}.`))
  else if (method === 'POST') out.push(check(G, 'share-method', 'share_target method', 'warn', 'POST is legal, but /share-target reads GET parameters. A service worker must intercept the POST and redirect to /share-target?title=&text=&url=.'))
  else out.push(check(G, 'share-method', 'share_target method', 'pass', 'GET: the share arrives as query parameters, which /share-target reads.'))

  const named = params ? ['title', 'text', 'url'].filter((k) => typeof params[k] === 'string') : []
  if (!params || (named.length === 0 && params.files === undefined)) out.push(check(G, 'share-params', 'share_target params', 'fail', 'No title, text, url or files mapping. The browser has nothing to put in the request.'))
  else if (params.files !== undefined && (method !== 'POST' || enctype !== 'multipart/form-data')) out.push(check(G, 'share-params', 'share_target params', 'fail', 'Files can only be received with method POST and enctype multipart/form-data.'))
  else out.push(check(G, 'share-params', 'share_target params', 'pass', `Maps ${named.join(', ') || 'files'}${named.length > 0 ? ` to ${named.map((k) => String(params?.[k])).join(', ')}` : ''}.`))
  return out
}

const SAFELISTED = new Set(['bitcoin', 'ftp', 'ftps', 'geo', 'im', 'irc', 'ircs', 'magnet', 'mailto', 'matrix', 'news', 'nntp', 'openpgp4fpr', 'sftp', 'sip', 'sms', 'smsto', 'ssh', 'tel', 'urn', 'webcal', 'wtai', 'xmpp'])

export function checkProtocolHandlers(manifest: Record<string, unknown>, ctx: CheckContext): ManifestCheck[] {
  const raw = manifest.protocol_handlers
  if (raw === undefined) return [check(G, 'protocol_handlers', 'protocol_handlers', 'info', 'Not declared. Optional. The landing route is /handle, with the link in ?uri=.')]
  if (!Array.isArray(raw)) return [check(G, 'protocol_handlers', 'protocol_handlers', 'fail', 'Not an array.')]
  return raw.map((entry, i): ManifestCheck => {
    const id = `protocol-${i}`
    const protocol = isRecord(entry) ? asString(entry.protocol) : null
    const label = `protocol ${protocol ?? `#${i + 1}`}`
    if (!isRecord(entry) || !protocol) return check(G, id, label, 'fail', 'Has no protocol.')
    if (!protocol.startsWith('web+') && !SAFELISTED.has(protocol)) return check(G, id, label, 'fail', `"${protocol}" must start with "web+" (lowercase letters after it) or be on the browser's safelist.`)
    const url = asString(entry.url)
    if (!url || !url.includes('%s')) return check(G, id, label, 'fail', 'The url must contain %s, where the browser puts the clicked link.')
    const target = resolveUrl(url.replace('%s', 'x'), ctx.manifestUrl)
    if (!target || !ctx.routeExists(target.pathname)) return check(G, id, label, 'fail', `${target?.pathname ?? url} is not a route of this app.`)
    return check(G, id, label, target.pathname === '/handle' ? 'pass' : 'warn', target.pathname === '/handle' ? '/handle receives it in ?uri=.' : `${target.pathname} exists, but the route built to receive protocol links is /handle.`)
  })
}

const CLIENT_MODES = new Set(['auto', 'navigate-new', 'navigate-existing', 'focus-existing'])

export function checkLaunchHandler(manifest: Record<string, unknown>): ManifestCheck[] {
  const raw = manifest.launch_handler
  if (raw === undefined) return [check(G, 'launch_handler', 'launch_handler', 'info', 'Not declared. Optional. Without it, every launch opens a new window.')]
  const modeValue = isRecord(raw) ? raw.client_mode : undefined
  const modes = Array.isArray(modeValue) ? modeValue : modeValue === undefined ? [] : [modeValue]
  if (modes.length === 0 || !modes.every((m) => typeof m === 'string' && CLIENT_MODES.has(m))) {
    return [check(G, 'launch_handler', 'launch_handler', 'fail', `client_mode must be one or more of ${[...CLIENT_MODES].join(', ')}.`)]
  }
  return [check(G, 'launch_handler', 'launch_handler', 'pass', `client_mode: ${modes.join(', ')}`)]
}
