import { QueryClientProvider } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { RouterProvider } from 'react-router'
import { getPersistConfig, queryClient } from '@/lib'
import { Toaster } from '@/ui'
import { router } from './router'

// Read once: the persist setting applies on reload, because hydration happens before the first render.
const persist = getPersistConfig()

/** Providers, the router and the one Toaster. Nothing else belongs here. */
export function App() {
  const tree = (
    <>
      <RouterProvider router={router} />
      <Toaster />
    </>
  )
  return persist ? (
    <PersistQueryClientProvider client={queryClient} {...persist}>
      {tree}
    </PersistQueryClientProvider>
  ) : (
    <QueryClientProvider client={queryClient}>{tree}</QueryClientProvider>
  )
}
