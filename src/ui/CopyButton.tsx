import { useEffect, useRef, useState } from 'react'
import { Button, IconButton, type ButtonSize, type ButtonVariant } from './Button'
import { cx } from './internal/cx'

export interface CopyButtonProps {
  /** The text to copy, or a function producing it at click time. */
  value: string | (() => string)
  label?: string
  /** A square icon-only button (the label becomes its accessible name). */
  iconOnly?: boolean
  size?: ButtonSize
  variant?: ButtonVariant
  onCopied?: () => void
  onError?: (error: unknown) => void
  className?: string
}

type CopyState = 'idle' | 'copied' | 'failed'

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  // Insecure contexts have no async clipboard: fall back to a throwaway textarea.
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try {
    if (!document.execCommand('copy')) throw new Error('Clipboard copy was refused')
  } finally {
    ta.remove()
  }
}

export function CopyButton({ value, label = 'Copy', iconOnly = false, size = 'sm', variant = 'ghost', onCopied, onError, className }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const run = async (): Promise<void> => {
    try {
      await writeClipboard(typeof value === 'function' ? value() : value)
      setState('copied')
      onCopied?.()
    } catch (err) {
      setState('failed')
      onError?.(err)
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 1800)
  }

  const shown = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label
  const icon = state === 'copied' ? 'check' : state === 'failed' ? 'warning' : 'copy'
  return (
    <>
      {iconOnly ? (
        <IconButton icon={icon} label={shown} size={size} variant={variant} className={className} onClick={() => void run()} />
      ) : (
        <Button icon={icon} size={size} variant={variant} className={cx(className)} onClick={() => void run()}>
          {shown}
        </Button>
      )}
      <span className="sr-only" role="status">
        {state === 'idle' ? '' : shown}
      </span>
    </>
  )
}
