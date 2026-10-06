/**
 * Everything that decides what a URL that is not an API route gets back, and what caching
 * headers every response carries: header profiles, dist/ file serving, the SPA fallback, 404s
 * and the final JSON error handler.
 */
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express'
import type { HeaderProfile } from '../shared/contracts'
import { isLabPath } from './meta'
import { runtime } from './runtime'
import { HttpError, addNote, ifNoneMatch, sendError } from './util'

/** The build output being served. OUTPOST_DIST_DIR points it elsewhere (the test suite serves a temp directory). */
export const DIST_DIR = path.resolve(process.env.OUTPOST_DIST_DIR ?? fileURLToPath(new URL('../dist', import.meta.url)))
const INDEX_FILE = path.join(DIST_DIR, 'index.html')

export function distStatus(): { dir: string; present: boolean } {
  return { dir: DIST_DIR, present: existsSync(INDEX_FILE) }
}

// ─── cache policy ─────────────────────────────────────────────────────────────
export type ResourceKind = 'volatile' | 'api' | 'media' | 'asset' | 'document' | 'service-worker' | 'manifest' | 'version' | 'other'

const isApiPath = (p: string): boolean => p === '/api' || p.startsWith('/api/')

/** Sorts a URL path into the class of resource whose caching the header profiles describe. */
export function classify(pathname: string): ResourceKind {
  // Answers that must never be replayed: the lab, the reachability probe, the login state, the live board,
  // and the bench strategy whose whole point is "always ask the server".
  if (isLabPath(pathname) || pathname === '/api/ping' || pathname === '/api/session' || pathname === '/api/signal' || pathname.startsWith('/api/bench/network-only/')) return 'volatile'
  if (isApiPath(pathname)) return 'api'
  if (pathname.startsWith('/media/')) return 'media'
  if (pathname.startsWith('/assets/')) return 'asset'
  if (pathname === '/sw.js') return 'service-worker'
  if (pathname === '/manifest.webmanifest') return 'manifest'
  if (pathname === '/version.json') return 'version'
  // No extension means a client-side route, which is answered with index.html.
  if (pathname === '/' || path.posix.extname(pathname) === '' || pathname.endsWith('.html')) return 'document'
  return 'other'
}

const ONE_YEAR = 31_536_000

export function cacheControlFor(kind: ResourceKind, profile: HeaderProfile): string {
  if (kind === 'volatile' || profile === 'no-store') return 'no-store'
  switch (kind) {
    case 'asset':
      // Content-hashed file names: safe to keep forever under every profile that allows caching at all.
      return `public, max-age=${ONE_YEAR}, immutable`
    case 'media':
      return 'public, max-age=86400'
    case 'api':
      return profile === 'http-cache-trap' ? 'max-age=60' : 'no-cache'
    case 'document':
    case 'service-worker':
    case 'manifest':
      // The classic "my service worker never updates" setup: the entry points are cached like assets.
      return profile === 'http-cache-trap' ? `max-age=${ONE_YEAR}` : 'no-cache'
    case 'version':
    case 'other':
      return 'no-cache'
  }
}

/** Sets Cache-Control from the profile in force for this very request. Routes may still override (they only ever tighten it). */
export const cachePolicy: RequestHandler = (req, res, next) => {
  res.setHeader('Cache-Control', cacheControlFor(classify(req.path), runtime.headerProfile))
  next()
}

// ─── dist/ ────────────────────────────────────────────────────────────────────
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
}

function mimeOf(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
}

/** Maps a URL path to a file inside dist/, or null if it would escape it or names a dotfile (except .well-known). */
function resolveInDist(pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null
  const relative = path.posix.normalize(decoded === '/' ? '/index.html' : decoded)
  const segments = relative.split('/').filter(Boolean)
  if (segments.some((s, i) => s.startsWith('.') && !(i === 0 && s === '.well-known'))) return null
  const file = path.join(DIST_DIR, ...segments)
  return file.startsWith(DIST_DIR + path.sep) ? file : null
}

async function regularFile(file: string): Promise<{ mtimeMs: number; mtime: Date } | null> {
  try {
    const s = await stat(file)
    return s.isFile() ? s : null
  } catch {
    return null
  }
}

function notFoundText(res: Response, pathname: string): void {
  res.status(404).set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.send(`Not found: ${pathname}\n`)
}

/** Serves one file with validators, answering 304 for a matching If-None-Match or a fresh If-Modified-Since. */
async function sendFile(req: Request, res: Response, file: string, kind: ResourceKind): Promise<boolean> {
  const info = await regularFile(file)
  if (!info) return false
  let data: Buffer
  try {
    data = await readFile(file)
  } catch {
    return false // removed between stat and read, e.g. a rebuild in progress
  }
  const etag = `W/"${data.length.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
  res.set({
    'Content-Type': mimeOf(file),
    'Cache-Control': cacheControlFor(kind, runtime.headerProfile),
    ETag: etag,
    'Last-Modified': info.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
  })
  // Our own comparison rather than Express' req.fresh: fetch() adds "Cache-Control: no-cache" to requests
  // that carry If-None-Match, and req.fresh would then refuse every revalidation a service worker makes.
  const since = req.get('If-Modified-Since')
  const unmodified = req.get('If-None-Match') ? ifNoneMatch(req, etag) : since !== undefined && Date.parse(since) >= Math.floor(info.mtimeMs / 1000) * 1000
  if (unmodified) {
    addNote(res, 'etag-304')
    res.status(304).end()
    return true
  }
  res.status(200).set('Content-Length', String(data.length)).end(data)
  return true
}

const wantsHtml = (req: Request): boolean => (req.get('Accept') ?? '').includes('text/html')

export const staticFiles: RequestHandler = async (req, res, next) => {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || isApiPath(req.path) || req.path.startsWith('/media/')) {
    next()
    return
  }
  const pathname = req.path
  const file = resolveInDist(pathname)
  if (file && (await sendFile(req, res, file, classify(pathname)))) return

  // A missing file with an extension, or anything under /assets/, is a real 404: answering it with
  // index.html would hide stale-chunk failures behind a 200 that is not JavaScript.
  const looksLikeFile = path.posix.extname(pathname) !== '' || pathname.startsWith('/assets/')
  if (looksLikeFile || !wantsHtml(req)) {
    notFoundText(res, pathname)
    return
  }
  if (await sendFile(req, res, INDEX_FILE, 'document')) return
  res
    .status(404)
    .set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    .send('Outpost API is running, but there is no dist/ build to serve.\nRun `npm run build` for the production-like server, or `npm run dev` for Vite on :5173.\n')
}

// ─── the end of the chain ─────────────────────────────────────────────────────
export const notFoundHandler: RequestHandler = (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (isApiPath(req.path)) sendError(res, 404, 'not_found', `No such endpoint: ${req.method} ${req.path}`)
  else notFoundText(res, req.path)
}

function errorStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null
  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown }
  const value = typeof status === 'number' ? status : statusCode
  return typeof value === 'number' ? value : null
}

function errorType(err: unknown): string {
  const type = typeof err === 'object' && err !== null ? (err as { type?: unknown }).type : undefined
  return typeof type === 'string' ? type : ''
}

/** Uniform JSON errors. The stack goes to the server log and never to the client. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  // Half a response is already out: the only honest way to say "this failed" is to close the connection.
  if (res.headersSent) {
    req.socket.destroy()
    return
  }
  if (req.socket.destroyed) return
  res.setHeader('Cache-Control', 'no-store')

  if (err instanceof HttpError) {
    sendError(res, err.status, err.code, err.message, err.details)
    return
  }
  const status = errorStatus(err)
  if (status !== null && status >= 400 && status < 500) {
    // body-parser and friends: malformed JSON, oversized or wrongly encoded bodies.
    const type = errorType(err)
    const message = type === 'entity.parse.failed' ? 'Request body is not valid JSON' : type === 'entity.too.large' ? 'Request body is too large' : 'Bad request'
    sendError(res, status, 'bad_request', message)
    return
  }
  console.error(`unhandled error in ${req.method} ${req.originalUrl}`, err)
  sendError(res, 500, 'internal', 'Internal server error')
}
