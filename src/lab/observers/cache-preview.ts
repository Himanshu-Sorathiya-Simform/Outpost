import { openExisting } from './cache-store'

export const TEXT_PREVIEW_CAP = 256 * 1024
export const IMAGE_PREVIEW_CAP = 2 * 1024 * 1024

export type Preview =
  | { kind: 'json'; value: unknown; bytes: number }
  | { kind: 'text'; text: string; truncated: boolean; bytes: number }
  | { kind: 'image'; url: string; bytes: number }
  | { kind: 'withheld'; reason: string }

const IMAGE = /^image\/(svg\+xml|png|jpe?g|webp|gif|avif|x-icon|vnd\.microsoft\.icon)/i
const TEXTUAL = /^(text\/|application\/(json|javascript|xml|manifest\+json|x-www-form-urlencoded)|.*\+(json|xml))/i

/** Reads the stored body for display. Images come back as an object URL: the caller must revoke it. */
export async function readPreview(name: string, request: Request): Promise<Preview> {
  const cache = await openExisting(name)
  const res = cache ? await cache.match(request, { ignoreVary: true }) : undefined
  if (!res) return { kind: 'withheld', reason: 'The entry is gone from the cache.' }
  if (res.type === 'opaque' || res.type === 'opaqueredirect') {
    return { kind: 'withheld', reason: 'An opaque response: the page cannot read its body, headers or status. That is the point of opaque. Chrome also pads its size in the quota.' }
  }
  const contentType = res.headers.get('content-type') ?? ''
  const blob = await res.blob()
  if (IMAGE.test(contentType)) {
    if (blob.size > IMAGE_PREVIEW_CAP) return { kind: 'withheld', reason: `Image is ${blob.size} bytes; the preview stops at ${IMAGE_PREVIEW_CAP}.` }
    return { kind: 'image', url: URL.createObjectURL(blob), bytes: blob.size }
  }
  if (!TEXTUAL.test(contentType) && contentType !== '') return { kind: 'withheld', reason: `${contentType} is not something to print. ${blob.size} bytes stored.` }
  const truncated = blob.size > TEXT_PREVIEW_CAP
  const text = await blob.slice(0, TEXT_PREVIEW_CAP).text()
  if (!truncated && /json/i.test(contentType)) {
    try {
      return { kind: 'json', value: JSON.parse(text) as unknown, bytes: blob.size }
    } catch {
      return { kind: 'text', text, truncated: false, bytes: blob.size }
    }
  }
  return { kind: 'text', text, truncated, bytes: blob.size }
}
