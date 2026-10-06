import { ErrorBoundary } from '@/lib'
import { Button, Icon, Tag } from '@/ui'
import styles from './ErrorsRenderBox.module.css'

function Bomb({ armed }: { armed: boolean }) {
  if (armed) throw new Error('Simulated render failure: this component threw while React was drawing it')
  return <p className={styles.fine}>This child is rendering normally. The render scenario below makes it throw.</p>
}

export interface ErrorsRenderBoxProps {
  armed: boolean
  onReset: () => void
}

/**
 * A local error boundary with a child that can be told to throw. It is the only boundary on the page: the crash stays
 * inside this box, and a Reset gives the child another attempt, which is what a boundary's reset is for.
 */
export function ErrorsRenderBox({ armed, onReset }: ErrorsRenderBoxProps) {
  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <span className={styles.label}>Render box</span>
        <Tag tone={armed ? 'error' : 'ok'} icon={armed ? 'warning' : 'check'}>
          {armed ? 'Crashed' : 'Healthy'}
        </Tag>
      </div>
      <ErrorBoundary
        source="lab:errors:render-box"
        resetKeys={[armed]}
        fallback={(error, reset) => (
          <div className={styles.fallback} role="alert">
            <p className={styles.msg}>
              <Icon name="bug" size={14} /> {error.userMessage}
            </p>
            <p className={styles.tech}>{error.message}</p>
            <Button
              size="sm"
              icon="refresh"
              onClick={() => {
                onReset()
                reset()
              }}
            >
              Reset
            </Button>
          </div>
        )}
      >
        <Bomb armed={armed} />
      </ErrorBoundary>
    </div>
  )
}
