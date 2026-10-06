import { useEffect, useRef, useState } from 'react'
import { useLocation, useMatches } from 'react-router'
import { titleFromHandle, useTitleOverride } from './route-handle'

const SITE = 'Outpost'
export const DEFAULT_TITLE = `${SITE} — field dispatch log`

/** Puts keyboard and screen reader users at the top of the new screen after a route change. */
function focusScreen(): void {
  const main = document.getElementById('main')
  if (!main) return
  const heading = main.querySelector<HTMLElement>('h1')
  const target = heading ?? main
  if (target === heading) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: false })
}

/**
 * Three jobs after every navigation that changes the pathname: keep document.title in step with the route handle
 * (or the page's own override), announce the new screen in a polite live region, and move focus to the page heading.
 * Search-param changes (filters) do none of it, so typing in a filter never steals focus.
 */
export function RouteEffects() {
  const { pathname } = useLocation()
  const matches = useMatches()
  const override = useTitleOverride((s) => s.title)
  const routeTitle = titleFromHandle(matches[matches.length - 1]?.handle)
  const title = override ?? routeTitle
  const [announcement, setAnnouncement] = useState('')
  const shownPath = useRef(pathname)
  const latestTitle = useRef(title)
  latestTitle.current = title

  useEffect(() => {
    document.title = title ? `${title} · ${SITE}` : DEFAULT_TITLE
  }, [title])

  useEffect(() => {
    if (shownPath.current === pathname) return
    shownPath.current = pathname
    const frame = requestAnimationFrame(() => {
      focusScreen()
      setAnnouncement(latestTitle.current ? `${latestTitle.current}. Page loaded.` : 'Page loaded.')
    })
    return () => cancelAnimationFrame(frame)
  }, [pathname])

  return (
    <p className="sr-only" role="status" aria-live="polite">
      {announcement}
    </p>
  )
}
