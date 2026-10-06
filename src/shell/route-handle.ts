import { useEffect } from 'react'
import { create } from 'zustand'

/** What a route may declare in its `handle`. The shell reads `title` for the tab title and the route announcement. */
export interface RouteHandle {
  title?: string
}

export function titleFromHandle(handle: unknown): string | undefined {
  if (typeof handle !== 'object' || handle === null || !('title' in handle)) return undefined
  return typeof handle.title === 'string' ? handle.title : undefined
}

interface TitleOverride {
  title: string | null
  set(title: string | null): void
}

export const useTitleOverride = create<TitleOverride>((set) => ({ title: null, set: (title) => set({ title }) }))

/**
 * Replaces the route's static title while the page is mounted: a dispatch page says "KRN-07 relay mast icing",
 * a chapter says its own name. Pass `undefined` while the data is still loading to keep the route title.
 */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return
    useTitleOverride.getState().set(title)
    return () => useTitleOverride.getState().set(null)
  }, [title])
}
