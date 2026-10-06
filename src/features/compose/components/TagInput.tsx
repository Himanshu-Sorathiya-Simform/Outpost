import { forwardRef, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { Tag, cx, useFieldControl } from '@/ui'
import { LIMITS } from '../form/form-values'
import { addTags } from './tags'
import styles from './TagInput.module.css'

export interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  /** The field carries an error (the message itself is shown by the surrounding Field). */
  invalid?: boolean
}

/**
 * Chips plus a text box. Enter or a comma adds what is typed, Backspace on an empty box removes the last chip,
 * and leaving the box adds a half-typed tag instead of losing it. Sits inside a <Field>.
 */
export const TagInput = forwardRef<HTMLInputElement, TagInputProps>(function TagInput({ value, onChange, invalid }, ref) {
  const f = useFieldControl({ invalid })
  const noteId = useId()
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const inner = useRef<HTMLInputElement | null>(null)

  const commit = (raw: string): void => {
    const added = addTags(value, raw)
    setNote(added.note)
    if (added.tags.length !== value.length) onChange(added.tags)
    setDraft(added.note ? raw : '')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
      setNote(null)
    }
  }

  const onText = (e: ChangeEvent<HTMLInputElement>): void => {
    const text = e.target.value
    setNote(null)
    if (text.includes(',')) commit(text)
    else setDraft(text)
  }

  const remove = (tag: string): void => {
    onChange(value.filter((t) => t !== tag))
    setNote(null)
    inner.current?.focus()
  }

  return (
    <div className={styles.wrap}>
      <div className={cx(styles.box, f.invalid && styles.invalid)} onClick={() => inner.current?.focus()}>
        {value.length > 0 ? (
          <ul className={styles.chips} aria-label="Tags added">
            {value.map((tag) => (
              <li key={tag}>
                <Tag tone="neutral" onRemove={() => remove(tag)} removeLabel={`Remove tag ${tag}`}>
                  {tag}
                </Tag>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          ref={(el) => {
            inner.current = el
            if (typeof ref === 'function') ref(el)
            else if (ref) ref.current = el
          }}
          id={f.id}
          className={styles.input}
          value={draft}
          onChange={onText}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() !== '' && commit(draft)}
          aria-describedby={[f['aria-describedby'], note ? noteId : null].filter(Boolean).join(' ') || undefined}
          aria-invalid={f['aria-invalid']}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="enter"
          placeholder={value.length === 0 ? 'ice, relay, resupply' : ''}
        />
      </div>
      <p className={styles.meta}>
        <span id={noteId} className={styles.note} role="status">
          {note}
        </span>
        <span className={cx(styles.count, value.length >= LIMITS.tags && styles.full)}>
          {value.length} / {LIMITS.tags}
        </span>
      </p>
    </div>
  )
})
