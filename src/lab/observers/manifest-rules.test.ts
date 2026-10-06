import { describe, expect, it } from 'vitest'
import type { CheckContext, ManifestCheck } from './manifest-load'
import { runManifestChecks } from './manifest-rules'

const ROUTES = new Set(['/', '/log', '/file', '/inbox', '/signal', '/share-target', '/handle'])

const ctx: CheckContext = {
  manifestUrl: new URL('http://outpost.test/manifest.webmanifest'),
  pageOrigin: 'http://outpost.test',
  routeExists: (path) => ROUTES.has(path),
  probe: async (url) => (url.pathname.includes('gone') ? { outcome: 'http-error', status: 404, contentType: 'text/plain' } : { outcome: 'ok', status: 200, contentType: 'image/png' }),
}

const good = {
  name: 'Outpost',
  short_name: 'Outpost',
  id: '/',
  start_url: '/log',
  scope: '/',
  display: 'standalone',
  theme_color: '#123456',
  background_color: '#ffffff',
  icons: [
    { src: '/i/192.png', sizes: '192x192', type: 'image/png' },
    { src: '/i/512.png', sizes: '512x512', type: 'image/png' },
    { src: '/i/mask.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  shortcuts: [{ name: 'File', url: '/file' }],
  share_target: { action: '/share-target', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
  protocol_handlers: [{ protocol: 'web+outpost', url: '/handle?uri=%s' }],
  launch_handler: { client_mode: 'navigate-existing' },
}

const byId = (checks: ManifestCheck[], id: string): ManifestCheck | undefined => checks.find((c) => c.id === id)

describe('runManifestChecks', () => {
  it('passes a coherent manifest with no failures', async () => {
    const checks = await runManifestChecks(good, ctx)
    expect(checks.filter((c) => c.level === 'fail')).toEqual([])
    expect(byId(checks, 'share-action')?.level).toBe('pass')
  })

  it('fails display browser, a start_url outside scope and an unreachable icon', async () => {
    const checks = await runManifestChecks({ ...good, display: 'browser', scope: '/app/', icons: [...good.icons, { src: '/i/gone.png', sizes: '512x512' }] }, ctx)
    expect(byId(checks, 'display')?.level).toBe('fail')
    expect(byId(checks, 'scope')?.level).toBe('fail')
    expect(checks.filter((c) => c.id.startsWith('icon-reach') && c.level === 'fail')).toHaveLength(1)
  })

  it('fails a shortcut that leaves the app, a protocol without %s and files on a GET share target', async () => {
    const checks = await runManifestChecks(
      {
        ...good,
        shortcuts: [{ name: 'Nowhere', url: '/nope' }],
        protocol_handlers: [{ protocol: 'web+outpost', url: '/handle' }],
        share_target: { action: '/share-target', method: 'GET', params: { files: [{ name: 'f', accept: ['image/*'] }] } },
      },
      ctx,
    )
    expect(byId(checks, 'shortcut-0')?.level).toBe('fail')
    expect(byId(checks, 'protocol-0')?.level).toBe('fail')
    expect(byId(checks, 'share-params')?.level).toBe('fail')
  })

  it('warns that a POST share target needs the worker to redirect', async () => {
    const checks = await runManifestChecks({ ...good, share_target: { ...good.share_target, method: 'POST', enctype: 'multipart/form-data' } }, ctx)
    expect(byId(checks, 'share-method')?.level).toBe('warn')
  })

  it('reports missing icons and identity as failures', async () => {
    const checks = await runManifestChecks({}, ctx)
    expect(byId(checks, 'name')?.level).toBe('fail')
    expect(byId(checks, 'icons')?.level).toBe('fail')
  })
})
