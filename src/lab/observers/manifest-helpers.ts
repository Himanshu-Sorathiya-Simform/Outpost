import type { ManifestCheck, ManifestLevel } from './manifest-load'

export const check = (group: ManifestCheck['group'], id: string, label: string, level: ManifestLevel, message: string): ManifestCheck => ({ id, group, label, level, message })

export const asString = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

export function resolveUrl(value: unknown, base: URL): URL | null {
  const text = asString(value)
  if (text === null) return null
  try {
    return new URL(text, base)
  } catch {
    return null
  }
}

export const inScope = (url: URL, scope: URL): boolean => url.origin === scope.origin && url.pathname.startsWith(scope.pathname)
