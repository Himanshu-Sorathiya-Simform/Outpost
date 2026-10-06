import { useEffect, useRef, type FocusEvent, type RefObject } from 'react'

export interface KeepRowFocus {
  ref: RefObject<HTMLUListElement | null>
  onFocus: (event: FocusEvent<HTMLUListElement>) => void
  onBlur: (event: FocusEvent<HTMLUListElement>) => void
}

/**
 * Marking a row read inside the "unread only" filter makes it leave the list on the next refetch, and the browser
 * then drops focus on <body>: a keyboard user would have to tab back from the top. This remembers which row had focus
 * and, when the rows change and focus has fallen to the page, puts it on the row that took that place.
 * `rowKey` changes whenever the set of rows does.
 */
export function useKeepRowFocus(rowKey: string): KeepRowFocus {
  const ref = useRef<HTMLUListElement>(null)
  const lastIndex = useRef<number | null>(null)

  useEffect(() => {
    const list = ref.current
    const index = lastIndex.current
    if (!list || index === null || (document.activeElement && document.activeElement !== document.body)) return
    const links = list.querySelectorAll<HTMLElement>('[data-row-link]')
    links[Math.min(index, links.length - 1)]?.focus()
  }, [rowKey])

  return {
    ref,
    onFocus: (event) => {
      const rows = Array.from(event.currentTarget.querySelectorAll('[data-dispatch-id]'))
      const here = event.target instanceof HTMLElement ? event.target.closest('[data-dispatch-id]') : null
      lastIndex.current = here ? rows.indexOf(here) : null
    },
    // Focus that moves to nothing while its element is still in the page is the user clicking away; let go of it.
    onBlur: (event) => {
      if (event.relatedTarget === null && event.target.isConnected) lastIndex.current = null
    },
  }
}
