import { useSyncExternalStore } from 'react'
import { focusManager, onlineManager } from '@tanstack/react-query'

const onBrowserNet = (listener: () => void): (() => void) => {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

const onVisibility = (listener: () => void): (() => void) => {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}

/** What React Query believes about the network. Starts out following the browser, and stays wherever setOnline last put it. */
export const useReactOnline = (): boolean => useSyncExternalStore((l) => onlineManager.subscribe(l), () => onlineManager.isOnline())

/** What the browser says: the network interface, not the internet. */
export const useBrowserOnline = (): boolean => useSyncExternalStore(onBrowserNet, () => navigator.onLine)

/** What React Query believes about focus. Follows page visibility until setFocused overrides it. */
export const useReactFocused = (): boolean => useSyncExternalStore((l) => focusManager.subscribe(l), () => focusManager.isFocused())

/** What the browser says: whether the page is visible. */
export const usePageVisible = (): boolean => useSyncExternalStore(onVisibility, () => document.visibilityState !== 'hidden')
