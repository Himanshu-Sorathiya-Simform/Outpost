/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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

export default defineConfig({
  plugins: [react(), versionJson()],
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
    include: ['src/**/*.test.{ts,tsx}', 'shared/**/*.test.ts', 'server/**/*.test.ts'],
    testTimeout: 20_000,
  },
})
