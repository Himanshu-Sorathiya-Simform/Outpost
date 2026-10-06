import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch } from '@shared/contracts'
import { callSeam } from '@/lib/bridge/seam'
import { AppError } from '@/lib/errors/app-error'
import { notify } from '@/lib/notify'
import { pwa, type ShareInput } from '@/pwa'
import { dispatchIndex, dispatchPath } from '../format'
import { copyText } from './copyText'

export interface DispatchSharing {
  /** The browser (through the seam) says it can open a share sheet for this dispatch. */
  canShare: boolean
  url: string
  /** Try the share sheet; anything short of a finished share ends in a copied link. Never throws. */
  share(): Promise<void>
}

const SUMMARY_CHARS = 140

function shareInputFor(d: Dispatch): ShareInput {
  const text = d.body.length > SUMMARY_CHARS ? `${d.body.slice(0, SUMMARY_CHARS).trimEnd()}...` : d.body
  return { title: `${dispatchIndex(d.id)} ${d.title}`, text, url: `${window.location.origin}${dispatchPath(d.id)}` }
}

function reasonFor(error: AppError | null): string {
  switch (error?.kind) {
    case 'not-implemented':
      return 'Sharing is not wired up yet.'
    case 'unsupported':
      return 'This browser cannot share.'
    case 'permission':
      return 'Sharing was blocked.'
    default:
      return 'Sharing did not go through.'
  }
}

/** Web Share through the seam, with "copy the link" as the floor it can always fall to. */
export function useShareDispatch(dispatch: Dispatch): DispatchSharing {
  const input = useMemo(() => shareInputFor(dispatch), [dispatch])
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    let current = true
    callSeam('share.canShare', () => pwa.share.canShare(input), { quiet: true }).then(
      (answer) => current && setCanShare(answer === true),
      () => current && setCanShare(false),
    )
    return () => {
      current = false
    }
  }, [input])

  const copyInstead = useCallback(
    async (reason: string): Promise<void> => {
      const copied = await copyText(input.url ?? '')
      notify(
        copied
          ? { key: 'dispatch-share', tone: 'info', title: 'Link copied', message: `${reason} The link is on the clipboard instead.` }
          : { key: 'dispatch-share', tone: 'warn', title: 'Could not copy the link', message: `${reason} Copy the address from the address bar.` },
      )
    },
    [input.url],
  )

  const share = useCallback(async (): Promise<void> => {
    try {
      const outcome = await callSeam('share.share', () => pwa.share.share(input))
      if (outcome === 'shared') notify({ key: 'dispatch-share', tone: 'ok', title: 'Shared', message: `${dispatchIndex(dispatch.id)} went to the share sheet.` })
      else if (outcome === 'unsupported') await copyInstead('This browser cannot share.')
      // 'cancelled' is the operator changing their mind: nothing to say.
    } catch (thrown) {
      const error = AppError.is(thrown) ? thrown : null
      if (error?.kind === 'aborted') return
      await copyInstead(reasonFor(error))
    }
  }, [input, dispatch.id, copyInstead])

  return { canShare, url: input.url ?? '', share }
}
