import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { Dispatch } from '@shared/contracts'
import type { Triage } from './useTriage'

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]'

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE) !== null
}

export interface TriageKeys {
  activeId: string | null
  /** Sets the active row (a row took focus by pointer or Tab). */
  activate(id: string): void
  registerRef(id: string, el: HTMLElement | null): void
}

/**
 * Keyboard triage: j / k move between rows, Enter opens, r reads, s stars, a acknowledges. Keys are ignored while the
 * user types in a field, while a dialog is open, and with Ctrl / Meta / Alt held. Enter is left alone when focus is on
 * a button or link, which already handle it.
 */
export function useTriageKeys(rows: Dispatch[], triage: Triage): TriageKeys {
  const navigate = useNavigate()
  const [activeId, setActiveId] = useState<string | null>(null)
  const els = useRef(new Map<string, HTMLElement>())
  const latest = useRef({ rows, triage, activeId })
  useEffect(() => {
    latest.current = { rows, triage, activeId }
  })

  const registerRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) els.current.set(id, el)
    else els.current.delete(id)
  }, [])

  const focusRow = useCallback((id: string) => {
    setActiveId(id)
    els.current.get(id)?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target) || document.querySelector('dialog[open]')) return
      const { rows: list, triage: actions, activeId: current } = latest.current
      const live = list.filter((r) => !actions.leavingIds.has(r.id))
      if (live.length === 0) return
      const at = live.findIndex((r) => r.id === current)

      switch (e.key) {
        case 'j':
        case 'k': {
          const step = e.key === 'j' ? 1 : -1
          const next = at === -1 ? (step === 1 ? 0 : live.length - 1) : Math.min(live.length - 1, Math.max(0, at + step))
          const row = live[next]
          if (row) focusRow(row.id)
          e.preventDefault()
          return
        }
        case 'Enter': {
          const onRow = e.target === document.body || (e.target instanceof HTMLElement && e.target.tagName === 'ARTICLE')
          const row = live[at]
          if (onRow && row) {
            e.preventDefault()
            void navigate(`/log/${row.id}`)
          }
          return
        }
        case 'r':
        case 'a':
        case 's': {
          const row = live[at]
          if (!row) return
          e.preventDefault()
          if (e.key === 's') {
            actions.toggleStar(row)
            return
          }
          // The row is about to leave; hand the cursor to its neighbour so triage can carry on without the mouse.
          if (e.key === 'a' && actions.signedOut) {
            actions.acknowledge(row)
            return
          }
          const neighbour = live[at + 1] ?? live[at - 1]
          if (e.key === 'r') actions.markRead(row)
          else actions.acknowledge(row)
          if (neighbour) focusRow(neighbour.id)
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusRow, navigate])

  return { activeId, activate: setActiveId, registerRef }
}
