/**
 * Cookie session plumbing. No dependency: the Cookie header is parsed by hand.
 * The cookie is HttpOnly, so page JavaScript (and therefore a service worker's clients) can
 * never read it; only `GET /api/session` tells the app whether it is signed in.
 */
import type { Request, RequestHandler, Response } from 'express'
import type { Session } from '../shared/contracts'
import { store } from './store'
import { sendError } from './util'

export const SESSION_COOKIE = 'outpost_sid'

declare module 'express-serve-static-core' {
  interface Request {
    /** Resolved by `sessionMiddleware`; null when signed out, expired or the cookie is unknown. */
    session: Session | null
    /** The cookie value, only when it maps to a live session. */
    sessionId: string | null
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const name = part.slice(0, eq).trim()
    if (!name || name in out) continue // first occurrence wins, as browsers send the most specific first
    const raw = part.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1')
    try {
      out[name] = decodeURIComponent(raw)
    } catch {
      out[name] = raw
    }
  }
  return out
}

export const sessionMiddleware: RequestHandler = (req, _res, next) => {
  const id = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  const session = id ? store.sessions.get(id) : undefined
  req.session = session ?? null
  req.sessionId = session && id ? id : null
  next()
}

export function setSessionCookie(res: Response, id: string, ttlSec: number = store.sessionTtlSec): void {
  res.append('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(id)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.max(0, Math.floor(ttlSec))}`)
}

export function clearSessionCookie(res: Response): void {
  res.append('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`)
}

/** Returns the live session, or answers 401 itself and returns null (callers just `return`). */
export function requireSession(req: Request, res: Response, message = 'This action needs an operator session. Clock in first.'): Session | null {
  if (req.session) return req.session
  sendError(res, 401, 'unauthorized', message)
  return null
}
