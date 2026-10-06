import { useCallback, type KeyboardEvent } from 'react'

export interface RowKeyHandlers {
  onStar: (id: string) => void
  onToggleRead: (id: string) => void
}

const TYPING = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

/**
 * Register-style keys for a list of rows: j / k move between rows, s stars, r toggles read. Enter needs no code:
 * the focused row link opens the dispatch. The handler sits on the list, so it only hears keys while focus is
 * inside it, and it stands aside for anything typed into a field or pressed with a modifier.
 */
export function useRowKeys({ onStar, onToggleRead }: RowKeyHandlers): (event: KeyboardEvent<HTMLElement>) => void {
  return useCallback(
    (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (!target || target.closest(TYPING)) return
      const row = target.closest<HTMLElement>('[data-dispatch-id]')
      if (!row) return

      const key = event.key.toLowerCase()
      if (key === 'j' || key === 'k') {
        const links = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-row-link]'))
        const here = links.findIndex((link) => row.contains(link))
        const next = links[here + (key === 'j' ? 1 : -1)]
        if (next) {
          event.preventDefault()
          next.focus()
        }
        return
      }
      const id = row.dataset.dispatchId
      if (!id) return
      if (key === 's') {
        event.preventDefault()
        onStar(id)
      } else if (key === 'r') {
        event.preventDefault()
        onToggleRead(id)
      }
    },
    [onStar, onToggleRead],
  )
}
