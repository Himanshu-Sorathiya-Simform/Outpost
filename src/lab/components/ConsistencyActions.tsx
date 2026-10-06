import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DispatchPatch } from '@shared/contracts'
import type { AppError } from '@/lib/errors/app-error'
import { toAppError } from '@/lib/errors/normalize'
import { endpoints, qk, useSpawnWire } from '@/lib/queries'
import { Button, ErrorState, Field, Plate, Segmented, Select } from '@/ui'
import styles from './ConsistencyActions.module.css'

type Flag = 'starred' | 'read'

const FLAG_OPTIONS = [
  { value: 'starred' as const, label: 'Star' },
  { value: 'read' as const, label: 'Read' },
]

export interface DispatchChoice {
  id: string
  title: string
}

interface Props {
  choices: DispatchChoice[]
  /** Fetch the server truth again (useLabTruth's refetch). */
  readThrough: () => Promise<unknown>
  readingThrough: boolean
  /** Read Cache Storage again. */
  checkStorage: () => void
}

function Lever({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className={styles.lever}>
      {children}
      <p className={styles.caption}>{caption}</p>
    </div>
  )
}

/** The buttons that move one layer and not the others, plus the two that put everything back in line. */
export function ConsistencyActions({ choices, readThrough, readingThrough, checkStorage }: Props) {
  const qc = useQueryClient()
  const spawn = useSpawnWire()
  const [picked, setPicked] = useState('')
  const [flag, setFlag] = useState<Flag>('starred')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const id = choices.some((c) => c.id === picked) ? picked : (choices[0]?.id ?? '')

  const run = async (work: () => Promise<string>): Promise<void> => {
    setWorking(true)
    setError(null)
    try {
      setMessage(await work())
    } catch (thrown) {
      setMessage(null)
      setError(toAppError(thrown, { source: 'consistency:lever' }))
    } finally {
      setWorking(false)
    }
  }

  const behindReactsBack = (): Promise<void> =>
    run(async () => {
      // The patch goes straight to the endpoint: usePatchDispatch would update React's cache and there would be nothing to see.
      const { data: truth } = await endpoints.getLabTruth()
      const before = truth.dispatches.find((d) => d.id === id)
      if (!before) throw new Error(`${id} is not on the server any more`)
      const next = !before[flag]
      const patch: DispatchPatch = flag === 'starred' ? { starred: next } : { read: next }
      const { data: after } = await endpoints.patchDispatch(id, patch)
      await readThrough()
      checkStorage()
      return `${id}: ${flag === 'starred' ? 'starred' : 'read'} is now ${String(next)} on the server, revision ${before.rev} to ${after.rev}. React was not told.`
    })

  const spawnWire = (): Promise<void> =>
    run(async () => {
      const { data } = await spawn.mutateAsync({ count: 1 })
      await readThrough()
      checkStorage()
      const made = data.spawned[0]
      return made ? `Filed ${made.id} on the server. The feed revision moved; React's feed has not been refreshed.` : 'The wire filed nothing.'
    })

  const refetchReact = (): void => {
    // Inactive queries are refetched too: this page mounts no observers of its own.
    void qc.invalidateQueries({ queryKey: qk.dispatches(), refetchType: 'all' })
    void qc.invalidateQueries({ queryKey: qk.inbox(), refetchType: 'all' })
    setMessage('React was told its dispatches and inbox are stale and is refetching them.')
    setError(null)
  }

  const heal = (): void => {
    void qc.invalidateQueries({ refetchType: 'all' })
    checkStorage()
    setMessage('Every query was invalidated and refetched. Cache Storage is only as fresh as your worker\'s strategy makes it.')
    setError(null)
  }

  return (
    <Plate index={502} title="Levers">
      <div className={styles.grid}>
        <section className={styles.group} aria-labelledby="levers-look">
          <h3 id="levers-look" className={styles.heading}>
            Look again
          </h3>
          <Lever caption="Invalidates React's dispatches and inbox. Only React moves.">
            <Button size="sm" icon="refresh" onClick={refetchReact}>
              Refetch in React
            </Button>
          </Lever>
          <Lever caption="Asks the server for the truth now instead of waiting for the next poll.">
            <Button size="sm" icon="server" loading={readingThrough} onClick={() => void readThrough()}>
              Read through to server
            </Button>
          </Lever>
          <Lever caption="Invalidates everything React holds. Does nothing to Cache Storage.">
            <Button size="sm" variant="primary" icon="check" onClick={heal}>
              Heal
            </Button>
          </Lever>
        </section>

        <section className={styles.group} aria-labelledby="levers-drift">
          <h3 id="levers-drift" className={styles.heading}>
            Make it drift
          </h3>
          <div className={styles.pick}>
            <Field label="Dispatch" labelHidden>
              <Select value={id} onChange={(e) => setPicked(e.target.value)} options={choices.map((c) => ({ value: c.id, label: c.title ? `${c.id}  ${c.title}` : c.id }))} disabled={choices.length === 0} />
            </Field>
            <Segmented label="Field to change" options={FLAG_OPTIONS} value={flag} onChange={setFlag} size="sm" />
          </div>
          <Lever caption="A real PATCH straight to the endpoint, not through the mutation hook. The server changes; React and Cache Storage do not hear of it.">
            <Button size="sm" variant="danger" icon="bolt" loading={working} disabled={id === ''} onClick={() => void behindReactsBack()}>
              Change behind React&apos;s back
            </Button>
          </Lever>
          <Lever caption="Files one wire dispatch. The feed revision moves on the server only.">
            <Button size="sm" icon="plus" loading={working} onClick={() => void spawnWire()}>
              Spawn wire dispatch
            </Button>
          </Lever>
        </section>
      </div>
      <div className={styles.status} role="status">
        {message}
      </div>
      {error ? <ErrorState compact error={error} /> : null}
    </Plate>
  )
}
