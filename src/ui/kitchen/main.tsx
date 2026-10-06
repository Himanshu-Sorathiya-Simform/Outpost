import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import '@/styles'
import { Kitchen } from './Kitchen'

const root = document.getElementById('root')
if (!root) throw new Error('#root missing in kitchen.html')
createRoot(root).render(
  <StrictMode>
    <MemoryRouter>
      <Kitchen />
    </MemoryRouter>
  </StrictMode>,
)
