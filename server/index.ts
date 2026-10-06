/**
 * Outpost server entry. `createApp()` builds the Express app with no side effects beyond
 * registering listeners, so tests can import it; `start()` listens and owns the timers.
 * Run directly (`tsx server/index.ts`) it starts on PORT (default 4000) and shuts down on SIGINT/SIGTERM.
 */
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Server } from 'node:http'
import express from 'express'
import { chaosMiddleware } from './chaos'
import { events } from './events'
import { installLabListeners, labRouter, stopLab, syncWireTimer } from './lab'
import { metaMiddleware, sameOriginWrites } from './meta'
import { pushRouter, pushSubscriptionCount, vapidFingerprint } from './push'
import { runtime } from './runtime'
import { apiRouter } from './routes/api'
import { benchRouter } from './routes/bench'
import { mediaRouter } from './routes/media'
import { sessionMiddleware } from './session'
import { cachePolicy, distStatus, errorHandler, notFoundHandler, staticFiles } from './static'
import { store } from './store'

export function createApp(): express.Express {
  const app = express()
  app.disable('x-powered-by')
  // Validators are produced by the routes themselves (util.sendJson, static files); Express' automatic ETags would
  // only add a second, unlogged way to answer 304.
  app.set('etag', false)
  // The routers are exact-match (see exactRouter); the app's own router is never used for routes, but keep it consistent.
  app.set('case sensitive routing', true)
  app.set('strict routing', true)

  // meta -> (cache policy, same-origin writes) -> chaos -> json -> session -> routers -> static -> errors (docs/ARCHITECTURE.md, "Server spec")
  app.use(metaMiddleware)
  app.use(cachePolicy)
  app.use(sameOriginWrites)
  app.use(chaosMiddleware)
  app.use(express.json({ limit: '256kb' }))
  app.use(sessionMiddleware)
  app.use(labRouter)
  app.use(pushRouter)
  app.use(apiRouter)
  app.use(benchRouter)
  app.use(mediaRouter)
  app.use(staticFiles)
  app.use(notFoundHandler)
  app.use(errorHandler)

  installLabListeners()
  return app
}

export interface RunningServer {
  app: express.Express
  server: Server
  port: number
  /** Ends SSE streams, stops timers, closes connections (hung ones included) and resolves when the port is free. */
  close(): Promise<void>
}

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((list) => list ?? [])
    .filter((a) => a.family === 'IPv4' && !a.internal)
    .map((a) => a.address)
}

function banner(port: number): string {
  const dist = distStatus()
  const lines = [
    '',
    `  Outpost ${process.env.APP_VERSION ?? '1.0.0'}  instance ${store.serverInstance}`,
    '',
    `  local      http://localhost:${port}`,
    ...lanAddresses().map((ip) => `  network    http://${ip}:${port}`),
    `  lab state  http://localhost:${port}/api/_lab/state`,
    '',
    `  headers    ${runtime.headerProfile}`,
    dist.present
      ? `  static     serving ${path.relative(process.cwd(), dist.dir) || dist.dir}/ (SPA fallback on)`
      : '  static     no dist/ found: API only. Run `npm run build` for the production-like server, or `npm run dev` for Vite on :5173',
    `  push       VAPID key ${vapidFingerprint()}, ${pushSubscriptionCount()} subscription(s)`,
    '',
  ]
  return lines.join('\n')
}

export function start(port: number = Number(process.env.PORT ?? 4000)): Promise<RunningServer> {
  const app = createApp()
  return new Promise((resolve, reject) => {
    const server = app.listen(port)
    server.once('error', (err: NodeJS.ErrnoException) => {
      reject(err.code === 'EADDRINUSE' ? new Error(`Port ${port} is already in use. Set PORT to another value.`) : err)
    })
    server.once('listening', () => {
      store.startDrift()
      syncWireTimer()
      const address = server.address()
      const actualPort = typeof address === 'object' && address ? address.port : port

      let closing: Promise<void> | null = null
      const close = (): Promise<void> => {
        closing ??= new Promise<void>((done) => {
          events.closeAll()
          stopLab()
          store.stopDrift()
          server.close(() => done())
          server.closeIdleConnections()
          // Whatever is still open after a moment is a hang, a slow body or a stuck client: cut it.
          setTimeout(() => server.closeAllConnections(), 1000).unref()
        })
        return closing
      }
      resolve({ app, server, port: actualPort, close })
    })
  })
}

function isMain(): boolean {
  const entry = process.argv[1]
  return entry !== undefined && import.meta.url === pathToFileURL(path.resolve(entry)).href
}

if (isMain()) {
  start()
    .then((running) => {
      process.stdout.write(`${banner(running.port)}\n`)
      let signalled = false
      const shutdown = (signal: string): void => {
        if (signalled) process.exit(1)
        signalled = true
        process.stdout.write(`\n  ${signal}: closing streams and connections\n`)
        // Safety net: a socket that refuses to die must not keep the process (and the port) alive.
        setTimeout(() => process.exit(1), 5000).unref()
        running.close().then(
          () => process.exit(0),
          () => process.exit(1),
        )
      }
      process.on('SIGINT', () => shutdown('SIGINT'))
      process.on('SIGTERM', () => shutdown('SIGTERM'))
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    })
}
