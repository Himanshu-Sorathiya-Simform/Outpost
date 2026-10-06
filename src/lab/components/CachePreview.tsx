import { useEffect, useState } from 'react'
import { toAppError } from '@/lib/errors/normalize'
import type { AppError } from '@/lib/errors/app-error'
import { readPreview, TEXT_PREVIEW_CAP, type Preview } from '../observers/cache-preview'
import { CodeBlock, ErrorState, JsonView, Loader, formatBytes } from '@/ui'
import styles from './CachePreview.module.css'

interface Props {
  cacheName: string
  request: Request
}

/** The stored body of one entry: JSON as a tree, text as text, small images as images, everything else withheld with a reason. */
export function CachePreview({ cacheName, request }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<AppError | null>(null)

  useEffect(() => {
    let current = true
    let imageUrl: string | null = null
    readPreview(cacheName, request).then(
      (result) => {
        if (result.kind === 'image') imageUrl = result.url
        if (current) setPreview(result)
        else if (imageUrl) URL.revokeObjectURL(imageUrl)
      },
      (err: unknown) => {
        if (current) setError(toAppError(err, { source: 'lab:cache-preview' }))
      },
    )
    return () => {
      current = false
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    }
  }, [cacheName, request])

  if (error) return <ErrorState compact error={error} />
  if (!preview) {
    return (
      <div role="status">
        <Loader label="Reading body" size="sm" />
      </div>
    )
  }
  return (
    <div className={styles.preview}>
      {preview.kind === 'json' ? <JsonView value={preview.value} title={`${formatBytes(preview.bytes)} of JSON`} expandDepth={2} maxHeight={280} /> : null}
      {preview.kind === 'text' ? (
        <>
          <CodeBlock code={preview.text} title={formatBytes(preview.bytes)} maxHeight={280} wrap />
          {preview.truncated ? <p className={styles.note}>Showing the first {formatBytes(TEXT_PREVIEW_CAP)} only.</p> : null}
        </>
      ) : null}
      {preview.kind === 'image' ? (
        <>
          <img className={styles.image} src={preview.url} alt={`Stored body of ${request.url}`} />
          <p className={styles.note}>{formatBytes(preview.bytes)}</p>
        </>
      ) : null}
      {preview.kind === 'withheld' ? <p className={styles.note}>{preview.reason}</p> : null}
    </div>
  )
}
