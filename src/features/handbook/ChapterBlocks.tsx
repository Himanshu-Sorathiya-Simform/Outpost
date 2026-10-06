import type { HandbookBlock } from '@shared/contracts'
import { CodeBlock, Icon, cx } from '@/ui'
import styles from './ChapterBlocks.module.css'

/**
 * A callout is told apart by shape as well as colour: a note has a single ruled edge and an info mark, a warning has a
 * double border, a warning mark and its own word.
 */
function Callout({ tone, text }: { tone: 'note' | 'warn'; text: string }) {
  return (
    <aside className={cx(styles.callout, styles[tone])}>
      <p className={styles.tag}>
        <Icon name={tone === 'warn' ? 'warning' : 'info'} size={14} />
        {tone === 'warn' ? 'Warning' : 'Note'}
      </p>
      <p className={styles.text}>{text}</p>
    </aside>
  )
}

export function ChapterBlocks({ blocks }: { blocks: readonly HandbookBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h':
            return <h2 key={i}>{block.text}</h2>
          case 'p':
            return <p key={i}>{block.text}</p>
          case 'ul':
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            )
          case 'callout':
            return <Callout key={i} tone={block.tone} text={block.text} />
          case 'code':
            return <CodeBlock key={i} code={block.text} />
        }
      })}
    </>
  )
}
