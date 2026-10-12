import { describe, expect, it } from 'vitest'
import type { CheckContext } from '@/lab/observers/manifest-load'
import { runManifestChecks } from '@/lab/observers/manifest-rules'
import indexHtml from '../../index.html?raw'
import manifestText from '../../public/manifest.webmanifest?raw'
import routerSource from '../router.tsx?raw'

const manifest = JSON.parse(manifestText) as Record<string, unknown> & {
  icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>
  screenshots: Array<{ src: string; sizes: string; type: string; form_factor: string; label: string }>
  shortcuts: Array<{ url: string }>
}

/** The routes of the app, read from the router: the same list the Lab's checklist asks about. */
const ROUTES = new Set(['/', ...[...routerSource.matchAll(/path: '([a-z][a-z-]*(?:\/[a-z:]+)?)'/g)].map((m) => `/${m[1]}`)])

/** Does the request land on a real route? A path with a parameter segment matches any value. */
const routeExists = (pathname: string): boolean => [...ROUTES].some((route) => new RegExp(`^${route.replace(/:[a-z]+/g, '[^/]+')}$`).test(pathname))

/** Every file the manifest names is judged reachable here; scripts/manifest-assets.test.ts checks the bytes of each one. */
const ctx: CheckContext = {
  manifestUrl: new URL('http://localhost:4000/manifest.webmanifest'),
  pageOrigin: 'http://localhost:4000',
  routeExists,
  probe: async (url) => ({ outcome: 'ok', status: 200, contentType: url.pathname.endsWith('.png') ? 'image/png' : 'image/jpeg' }),
}

describe('public/manifest.webmanifest, judged by the Lab checklist', () => {
  it('has no failures and no warnings', async () => {
    const checks = await runManifestChecks(manifest, ctx)
    expect(checks.filter((c) => c.level === 'fail' || c.level === 'warn').map((c) => `${c.id}: ${c.message}`)).toEqual([])
  })

  it('passes the shortcut, share target, protocol handler and screenshot rows', async () => {
    const checks = await runManifestChecks(manifest, ctx)
    const levels = Object.fromEntries(checks.map((c) => [c.id, c.level]))
    expect(levels['share-action']).toBe('pass')
    expect(checks.filter((c) => /^shortcut/.test(c.id)).every((c) => c.level === 'pass')).toBe(true)
    expect(checks.filter((c) => /^protocol/.test(c.id)).every((c) => c.level === 'pass')).toBe(true)
    expect(checks.filter((c) => c.id.startsWith('shot-')).every((c) => c.level === 'pass')).toBe(true)
    expect(levels.screenshots).toBe('pass')
  })
})

describe('the identity and the receiving ends', () => {
  it('has the values the briefing accepted', () => {
    expect(manifest).toMatchObject({ id: '/', name: 'Outpost: field dispatch log', short_name: 'Outpost', start_url: '/log', scope: '/', display: 'standalone', theme_color: '#ede8da', background_color: '#ede8da' })
    expect(manifest.launch_handler).toEqual({ client_mode: 'navigate-existing' })
    expect(manifest.share_target).toEqual({ action: '/share-target', method: 'GET', enctype: 'application/x-www-form-urlencoded', params: { title: 'title', text: 'text', url: 'url' } })
    expect(manifest.protocol_handlers).toEqual([{ protocol: 'web+outpost', url: '/handle?uri=%s' }])
    expect((manifest.short_name as string).length).toBeLessThanOrEqual(12)
  })

  it('has three shortcuts, to File, Inbox and Signal, that are all routes of the app', () => {
    expect(manifest.shortcuts.map((s) => s.url)).toEqual(['/file', '/inbox', '/signal'])
    expect(manifest.shortcuts.every((s) => routeExists(s.url))).toBe(true)
  })

  it('has the theme colour of the page, so the address bar and the manifest agree', () => {
    expect(indexHtml).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`)
  })

  it('is linked from index.html, with the apple-touch-icon for iOS', () => {
    expect(indexHtml).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(indexHtml).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />')
  })
})

describe('the icons', () => {
  it('are 192 and 512 with purpose any, and a SEPARATE maskable one (never "any maskable" in one file)', () => {
    expect(manifest.icons.map((i) => `${i.sizes}:${i.purpose}`)).toEqual(['192x192:any', '512x512:any', '512x512:maskable'])
    expect(new Set(manifest.icons.map((i) => i.src)).size).toBe(3)
  })
})

describe('the screenshots', () => {
  const byForm = (form: string) => manifest.screenshots.filter((s) => s.form_factor === form)

  it('have at least one wide and one narrow, and at most eight of each (browsers show eight)', () => {
    for (const form of ['wide', 'narrow']) {
      expect(byForm(form).length).toBeGreaterThanOrEqual(1)
      expect(byForm(form).length).toBeLessThanOrEqual(8)
    }
    expect(manifest.screenshots.every((s) => ['wide', 'narrow'].includes(s.form_factor))).toBe(true)
  })

  it("keep to the browsers' limits: each side 320 to 3840 px, the long side at most 2.3 times the short one, one size per form factor, a label each", () => {
    for (const shot of manifest.screenshots) {
      const [w, h] = shot.sizes.split('x').map(Number) as [number, number]
      expect(Math.min(w, h)).toBeGreaterThanOrEqual(320)
      expect(Math.max(w, h)).toBeLessThanOrEqual(3840)
      expect(Math.max(w, h) / Math.min(w, h)).toBeLessThanOrEqual(2.3)
      expect(shot.label.length).toBeGreaterThan(3)
      expect(shot.form_factor).toBe(w > h ? 'wide' : 'narrow')
    }
    for (const form of ['wide', 'narrow']) expect(new Set(byForm(form).map((s) => s.sizes)).size).toBe(1)
  })

  it('show the same eight screens of the app in both form factors', () => {
    const names = (form: string) => byForm(form).map((s) => s.src.replace(/^.*\/(wide|narrow)-/, '').replace('.jpg', ''))
    expect(names('wide')).toEqual(['log', 'dispatch', 'inbox', 'stations', 'signal', 'handbook', 'file', 'settings'])
    expect(names('narrow')).toEqual(names('wide'))
  })
})
