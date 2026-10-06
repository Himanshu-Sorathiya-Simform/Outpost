import { callSeam, notify } from '@/lib'
import { AppError } from '@/lib/errors/app-error'
import { pwa, type ShareInput } from '@/pwa'

/** Copies text, through the async clipboard where there is one and a throwaway textarea where there is not. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try {
      return document.execCommand('copy')
    } finally {
      area.remove()
    }
  } catch {
    return false
  }
}

/**
 * Hands the link to the share sheet through the seam. Anything short of a completed share (the seam is still a stub,
 * the browser cannot share, permission refused) falls back to copying the link, and the toast says which it was.
 */
export async function shareLink(input: ShareInput & { url: string }): Promise<void> {
  let reason = 'unsupported'
  try {
    const outcome = await callSeam('share.share', () => pwa.share.share(input))
    if (outcome === 'shared') {
      notify({ tone: 'ok', title: 'Shared' })
      return
    }
    if (outcome === 'cancelled') return
  } catch (error) {
    reason = AppError.is(error) ? error.kind : 'unknown'
  }

  const why = reason === 'not-implemented' ? 'Sharing is not wired up yet' : reason === 'unsupported' ? 'This browser cannot share' : 'Sharing did not go through'
  if (await copyText(input.url)) notify({ tone: 'info', title: 'Link copied', message: `${why}, so the link was put on the clipboard instead.` })
  else notify({ tone: 'warn', title: 'Could not copy the link', message: `${why}. The link is ${input.url}` })
}
