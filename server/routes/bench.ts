/**
 * Strategy bench. One route per strategy on purpose: the five strategies differ only in their URL,
 * so a service worker can match each with its own caching rule.
 * Mount at the application root.
 */
import { BENCH_STRATEGIES } from '../../shared/contracts'
import { runtime } from '../runtime'
import { store } from '../store'
import { HttpError, asyncRoute, exactRouter, sendJson } from '../util'

export const benchRouter = exactRouter()

function notFound(strategy: string, key: string): HttpError {
  return new HttpError(404, 'not_found', `No bench entry ${strategy}/${key}`)
}

for (const strategy of BENCH_STRATEGIES) {
  benchRouter.get(
    `/api/bench/${strategy}/:key`,
    asyncRoute((req, res) => {
      const body = store.bench.get(strategy, req.params.key, typeof res.locals.requestId === 'string' ? res.locals.requestId : undefined)
      if (!body) throw notFound(strategy, req.params.key)

      // Only network-only sets a header itself: with the realistic profile it must say no-store,
      // since it is the one strategy whose whole point is "never reuse this". Every other
      // Cache-Control value on this route comes from the header profile (meta middleware).
      if (strategy === 'network-only' && runtime.headerProfile === 'realistic') res.setHeader('Cache-Control', 'no-store')

      // No ETag, so never a 304: each answer is unique (hits, servedAt, requestId) and the
      // bench exists to show whether the number you see came from the server or from a cache.
      sendJson(req, res, body, { etag: false, rev: body.rev })
    }),
  )

  benchRouter.post(
    `/api/bench/${strategy}/:key/bump`,
    asyncRoute((req, res) => {
      const bumped = store.bench.bump(strategy, req.params.key)
      if (!bumped) throw notFound(strategy, req.params.key)
      sendJson(req, res, bumped, { etag: false, rev: bumped.rev })
    }),
  )
}

// Valid-looking bench paths with an unknown strategy answer 404 JSON instead of falling through.
benchRouter.all(
  ['/api/bench/:strategy/:key', '/api/bench/:strategy/:key/bump'],
  asyncRoute((req) => {
    throw notFound(req.params.strategy, req.params.key)
  }),
)
