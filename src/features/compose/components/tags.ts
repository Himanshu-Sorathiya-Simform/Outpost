import { LIMITS } from '../form/form-values'

/** "#Sea Ice " -> "sea-ice". */
export const normalizeTag = (raw: string): string => raw.trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase()

export interface TagAddition {
  tags: string[]
  /** Why something was not added, or null. */
  note: string | null
}

/** Adds every comma-separated piece of `raw`, skipping duplicates and stopping at the limits. */
export function addTags(current: readonly string[], raw: string): TagAddition {
  const tags = [...current]
  let note: string | null = null
  for (const piece of raw.split(',')) {
    const tag = normalizeTag(piece)
    if (tag === '' || tags.includes(tag)) continue
    if (tag.length > LIMITS.tagMax) {
      note = `"${tag.slice(0, 12)}…" is over ${LIMITS.tagMax} characters. Shorten it.`
      continue
    }
    if (tags.length >= LIMITS.tags) {
      note = `${LIMITS.tags} tags is the limit. Remove one first.`
      break
    }
    tags.push(tag)
  }
  return { tags, note }
}
