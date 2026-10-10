// What it holds:  the three checks a cache-first answer must pass before it may be stored: isImage, isAsset, isBenchEntry.
// What it means: a 404, an error JSON, a captive portal's HTML or a body of zero bytes all arrive as a "successful" fetch, and a stored one
//                would be served for as long as the cache lives. Each check says what one kind of URL has to look like. They are
//                positive checks (what it must be), not block lists (what it must not be): an empty 200 with a JSON type is not on any
//                block list, but it is not a script either.
// Caching type:  runtime (these decide what the runtime type may write).
// Caches touched: none directly; strategies/cache-first.ts asks them before writing to media-v1, assets-v1 or api-v1.

import { BENCH_CACHE_FIRST } from '../config'
import { contentType, readJson } from './network'

/** A plate or thumbnail: any image type. Stored in media-v1. */
export const isImage = async (response: Response): Promise<boolean> => contentType(response).startsWith('image/')

/** The types a hashed file under /assets/ really has: script, style, wasm, font or image. A page of HTML or a JSON error is not one. */
const ASSET_TYPE = /^(text\/(javascript|css)|application\/(javascript|wasm)|font\/|application\/font-|image\/)/

/** A hashed file: one of ASSET_TYPE. Stored in assets-v1. */
export const isAsset = async (response: Response): Promise<boolean> => ASSET_TYPE.test(contentType(response))

/** A bench cache-first entry: JSON whose `strategy` is cache-first and whose `key` is the key in the URL. Stored in api-v1. */
export async function isBenchEntry(response: Response, url: URL): Promise<boolean> {
  if (!contentType(response).includes('application/json')) return false
  try {
    const body = await readJson(response, url.pathname)
    return body.strategy === 'cache-first' && body.key === url.pathname.slice(BENCH_CACHE_FIRST.length)
  } catch {
    return false
  }
}
