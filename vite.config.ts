/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bundleWorker } from './scripts/sw-build.ts'
import { requireShellUrls, shellUrls } from './scripts/sw-shell.ts'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// Every `vite build` gets a fresh BUILD_ID, even when the semver is unchanged.
// That is deliberate: it lets you ship "a new deploy" without touching code, so you
// can practise service-worker updates. APP_VERSION / BUILD_ID can be overridden via env.
const APP_VERSION = process.env.APP_VERSION ?? pkg.version
const BUILD_ID = process.env.BUILD_ID ?? Date.now().toString(36)
const BUILD_TIME = new Date().toISOString()

const API_TARGET = `http://localhost:${process.env.PORT ?? 4000}`

/** Emits /version.json (build -> dist, dev -> middleware). Mirrors what many real deployments ship. */
function versionJson(): Plugin {
  const body = JSON.stringify({ version: APP_VERSION, buildId: BUILD_ID, builtAt: BUILD_TIME }, null, 2)
  return {
    name: 'outpost:version-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body })
    },
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(body)
      })
    },
  }
}

/**
 * Builds the service worker. The worker is TypeScript under src/sw/; after the app bundle is written it is bundled into ONE classic
 * script, dist/sw.js, with the build id and the list of shell files written into it. Every build therefore produces different worker
 * bytes, so a deploy is a new worker version to the browser. See scripts/sw-build.ts for why that has to happen inside the file.
 * Under `npm run dev` the same bundle is served at /sw.js on every request, with the id 'dev' and an empty shell list (only the page and
 * the API data are stored there).
 */
function serviceWorker(): Plugin {
  let outDir = ''
  let isBuild = false
  return {
    name: 'outpost:service-worker',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
      isBuild = config.command === 'build'
    },
    // Reads the finished files from disk rather than the bundle object: index.html is only emitted late in the build.
    async closeBundle() {
      if (!isBuild) return
      const page = resolve(outDir, 'index.html')
      if (!existsSync(page)) return
      const readText = (url: string): string | undefined => (existsSync(resolve(outDir, `.${url}`)) ? readFileSync(resolve(outDir, `.${url}`), 'utf8') : undefined)
      const urls = requireShellUrls(shellUrls(readFileSync(page, 'utf8'), readText))
      writeFileSync(resolve(outDir, 'sw.js'), await bundleWorker({ buildId: BUILD_ID, urls }))
    },
    configureServer(server) {
      server.middlewares.use('/sw.js', async (_req, res) => {
        try {
          const code = await bundleWorker({ buildId: 'dev', urls: [] })
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(code)
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(`The service worker did not bundle: ${error instanceof Error ? error.message : String(error)}`)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), versionJson(), serviceWorker()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/media': { target: API_TARGET, changeOrigin: false },
    },
  },
  build: {
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', 'server/**/*.test.ts', 'scripts/**/*.test.ts'],
    testTimeout: 20_000,
  },
})
