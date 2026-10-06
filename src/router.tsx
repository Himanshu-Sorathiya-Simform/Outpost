import type { ComponentType } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { AppShell } from '@/shell/AppShell'
import { HydrateFallback } from '@/shell/HydrateFallback'
import type { RouteHandle } from '@/shell/route-handle'
import { RouteError } from '@/shell/RouteError'
import NotFoundPage from '@/shell/pages/NotFoundPage'
import OfflinePage from '@/shell/pages/OfflinePage'

type PageModule = { default: ComponentType }

/**
 * Resolves a page module into route properties. If the chunk cannot be fetched, the failure is handed back as a
 * loader that throws it: React Router keeps a rejected `lazy` on the route and then renders nothing below the shell,
 * whereas a thrown loader error reaches the route's errorElement like any other failure.
 */
const Unreachable = (): null => null

async function resolvePage(load: () => Promise<PageModule>): Promise<{ Component: ComponentType; loader?: () => never }> {
  try {
    return { Component: (await load()).default }
  } catch (error) {
    // The Component is never drawn (the error replaces it); it only keeps React Router from warning about a leaf without one.
    return {
      Component: Unreachable,
      loader: () => {
        throw error
      },
    }
  }
}

/** Lazy route module: the page file default-exports its component; the router loads it on first navigation. */
const page = (load: () => Promise<PageModule>, title: string): Pick<RouteObject, 'lazy' | 'handle' | 'errorElement'> => ({
  lazy: () => resolvePage(load),
  handle: { title } satisfies RouteHandle,
  errorElement: <RouteError />,
})

/**
 * A route whose chunk cannot be fetched, exactly like a hashed file that a newer deploy deleted.
 * The URL is assembled at runtime and hidden from the bundler, so nothing ever builds it. Reached only from Lab -> Errors.
 */
const loadMissingChunk = (): ReturnType<typeof resolvePage> =>
  resolvePage(async () => {
    const url = '/assets/never-built-' + 'chunk.js'
    const mod: PageModule = await import(/* @vite-ignore */ url)
    return mod
  })

const errorElement = <RouteError />

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError standalone />,
    hydrateFallbackElement: <HydrateFallback />,
    children: [
      { index: true, element: <Navigate to="/log" replace />, errorElement },
      { path: 'log', ...page(() => import('@/features/dispatches/pages/LogPage'), 'Log') },
      { path: 'log/:id', ...page(() => import('@/features/dispatches/pages/DispatchPage'), 'Dispatch') },
      { path: 'file', ...page(() => import('@/features/compose/pages/ComposePage'), 'File dispatch') },
      { path: 'drafts', ...page(() => import('@/features/compose/pages/DraftsPage'), 'Drafts') },
      { path: 'share-target', ...page(() => import('@/features/compose/pages/ShareTargetPage'), 'Shared to Outpost') },
      { path: 'handle', ...page(() => import('@/features/compose/pages/HandlePage'), 'Open link') },
      { path: 'inbox', ...page(() => import('@/features/inbox/pages/InboxPage'), 'Inbox') },
      { path: 'stations', ...page(() => import('@/features/stations/pages/StationsPage'), 'Stations') },
      { path: 'stations/:code', ...page(() => import('@/features/stations/pages/StationPage'), 'Station') },
      { path: 'signal', ...page(() => import('@/features/signal/pages/SignalPage'), 'Signal') },
      { path: 'handbook', ...page(() => import('@/features/handbook/pages/HandbookPage'), 'Handbook') },
      { path: 'handbook/:slug', ...page(() => import('@/features/handbook/pages/ChapterPage'), 'Handbook chapter') },
      { path: 'settings', ...page(() => import('@/features/settings/pages/SettingsPage'), 'Settings') },
      { path: 'offline', Component: OfflinePage, handle: { title: 'No signal' } satisfies RouteHandle, errorElement },
      {
        path: 'lab',
        ...page(() => import('@/lab/LabLayout'), 'Lab'),
        children: [
          { index: true, ...page(() => import('@/lab/pages/LabHomePage'), 'Lab') },
          { path: 'environment', ...page(() => import('@/lab/pages/EnvironmentPage'), 'Lab: Environment') },
          { path: 'worker', ...page(() => import('@/lab/pages/WorkerPage'), 'Lab: Worker') },
          { path: 'caches', ...page(() => import('@/lab/pages/CachesPage'), 'Lab: Caches') },
          { path: 'bench', ...page(() => import('@/lab/pages/BenchPage'), 'Lab: Bench') },
          { path: 'consistency', ...page(() => import('@/lab/pages/ConsistencyPage'), 'Lab: Consistency') },
          { path: 'network', ...page(() => import('@/lab/pages/NetworkPage'), 'Lab: Network') },
          { path: 'chaos', ...page(() => import('@/lab/pages/ChaosPage'), 'Lab: Chaos') },
          { path: 'server', ...page(() => import('@/lab/pages/ServerPage'), 'Lab: Server') },
          { path: 'queue', ...page(() => import('@/lab/pages/QueuePage'), 'Lab: Queue') },
          { path: 'errors', ...page(() => import('@/lab/pages/ErrorsPage'), 'Lab: Errors') },
          { path: 'query', ...page(() => import('@/lab/pages/QueryPage'), 'Lab: Query') },
          // Deliberately broken. No link in the nav; the Errors page links here.
          { path: 'errors/route-crash', ...page(() => import('@/lab/pages/errors/CrashRoute'), 'Lab: Route crash') },
          { path: 'errors/route-chunk', lazy: loadMissingChunk, handle: { title: 'Lab: Route chunk' } satisfies RouteHandle, errorElement },
          { path: '*', Component: NotFoundPage, handle: { title: 'Not found' } satisfies RouteHandle, errorElement },
        ],
      },
      { path: '*', Component: NotFoundPage, handle: { title: 'Not found' } satisfies RouteHandle, errorElement },
    ],
  },
]

export const router = createBrowserRouter(routes)
