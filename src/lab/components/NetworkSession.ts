import { create } from 'zustand'

/** The server log can be emptied from this page; client requests older than that can no longer be judged. */
interface NetworkSession {
  serverClearedAt: number
  markServerCleared(): void
}

export const useNetworkSession = create<NetworkSession>((set) => ({
  serverClearedAt: 0,
  markServerCleared: () => set({ serverClearedAt: Date.now() }),
}))
