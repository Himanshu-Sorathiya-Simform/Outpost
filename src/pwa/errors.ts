/** Thrown by every stub in src/pwa until you replace it. The app treats this as a normal, non-fatal state. */
export class PwaNotImplementedError extends Error {
  readonly feature: string
  constructor(feature: string, hint?: string) {
    super(`PWA feature "${feature}" is not implemented yet${hint ? ` — ${hint}` : ''}`)
    this.name = 'PwaNotImplementedError'
    this.feature = feature
  }
}

export function notImplemented(feature: string, hint?: string): never {
  throw new PwaNotImplementedError(feature, hint)
}
