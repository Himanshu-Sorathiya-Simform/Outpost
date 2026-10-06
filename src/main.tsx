import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles'
import { callSeam, ErrorBoundary, startFoundation } from '@/lib'
import { startWorkerObserver } from '@/lab/observers/worker-observer'
import { bootPwa } from '@/pwa'
import { RootFallback } from '@/shell/RootFallback'
import { App } from './App'
import { router } from './router'

const container = document.getElementById('root')
if (!container) throw new Error('#root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary source="root" fallback={(error, reset) => <RootFallback error={error} reset={reset} />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Observers start once, outside React, so StrictMode's double effects cannot start them twice.
const stopFoundation = startFoundation({ navigate: (to) => void router.navigate(to) })
const stopWorkerObserver = startWorkerObserver()

// The seam wrapper records the attempt in the bridge log. While boot() is a stub it resolves quietly.
callSeam('boot', () => bootPwa(), { quiet: true }).catch(() => undefined)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopWorkerObserver()
    stopFoundation()
  })
}
