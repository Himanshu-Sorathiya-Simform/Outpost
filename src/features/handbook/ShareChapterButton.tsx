import { useState } from 'react'
import { Button } from '@/ui'
import { shareLink } from './shareChapter'

export interface ShareChapterButtonProps {
  slug: string
  title: string
  summary: string
}

export function ShareChapterButton({ slug, title, summary }: ShareChapterButtonProps) {
  const [busy, setBusy] = useState(false)
  const share = (): void => {
    setBusy(true)
    void shareLink({ title: `Handbook: ${title}`, text: summary, url: new URL(`/handbook/${encodeURIComponent(slug)}`, window.location.origin).href }).finally(() => setBusy(false))
  }
  return (
    <Button icon="share" loading={busy} onClick={share}>
      Share
    </Button>
  )
}
