import { useMemo, type ReactNode } from 'react'
import { DEFAULT_USER_MESSAGE, LEARNING_HINT } from '@/lib'
import { CopyButton, Drawer, formatBytes, formatDuration, formatStamp, JsonView, KeyValue, ProvenanceChip, type KeyValueItem } from '@/ui'
import { findMetaByRequestId } from './NetworkMeta'
import { CLASS_MEANING, CLASS_NAME, serverEnd, type JoinedRow } from './NetworkJoin'
import { NetworkStamp } from './NetworkStamp'
import styles from './NetworkDetail.module.css'

const none = <span className={styles.none}>-</span>
const orNone = (v: string | number | null | undefined): ReactNode => (v === null || v === undefined || v === '' ? none : v)

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>{title}</h3>
      {children}
    </section>
  )
}

function clock(ms: number): string {
  return `${formatStamp(ms)}:${String(new Date(ms).getSeconds()).padStart(2, '0')}.${String(new Date(ms).getMilliseconds()).padStart(3, '0')}`
}

function summaryItems(row: JoinedRow): KeyValueItem[] {
  const link = { id: 'X-Request-Id', heuristic: 'heuristic: tab + path + time (within 3 s)', replay: 'X-Request-Id of an earlier request', none: 'none' }[row.link]
  return [
    { label: 'Class', value: `${CLASS_NAME[row.cls]}` },
    { label: 'Joined by', value: link },
    { label: 'Started', value: clock(row.at) },
    { label: 'Tab', value: row.tab === null ? none : row.ownTab ? `${row.tab} (this tab)` : row.tab },
    { label: 'Status: client', value: orNone(row.clientStatus) },
    { label: 'Status: server', value: orNone(row.serverStatus) },
    { label: 'Duration: client', value: row.client ? formatDuration(row.client.durationMs) : none },
    { label: 'Duration: server', value: row.server ? formatDuration(row.server.durationMs) : none },
    { label: 'Chaos rule', value: orNone(row.chaos) },
    { label: 'Notes', value: row.notes.length > 0 ? row.notes.join(', ') : none },
  ]
}

function serverItems(row: JoinedRow): KeyValueItem[] {
  const s = row.server ?? row.replayOf
  if (!s) return []
  return [
    { label: 'Seq', value: s.seq },
    { label: 'Finished', value: clock(serverEnd(s)) },
    { label: 'Request id', value: s.requestId },
    { label: 'Status', value: s.status === 0 ? '0 (socket dropped, hung or abandoned)' : s.status },
    { label: 'Took', value: formatDuration(s.durationMs) },
    { label: 'Bytes on the wire', value: formatBytes(s.bytes) },
    { label: 'Sec-Fetch-Dest', value: orNone(s.dest) },
    { label: 'Sec-Fetch-Mode', value: orNone(s.mode) },
    { label: 'Sec-Fetch-Site', value: orNone(s.site) },
    { label: 'X-Tab-Id', value: orNone(s.tab) },
    { label: 'Chaos', value: orNone(s.chaos) },
    { label: 'Server notes', value: s.notes.length > 0 ? s.notes.join(', ') : none },
  ]
}

function ClientSection({ row }: { row: JoinedRow }) {
  const c = row.client
  const meta = useMemo(() => findMetaByRequestId(c?.requestId ?? null), [c?.requestId])
  if (!c) return null
  return (
    <>
      <Section title="Client entry">
        <KeyValue
          dense
          items={[
            { label: 'Request', value: `${c.method} ${c.url}` },
            { label: 'Status', value: c.status === 0 ? '0 (no response)' : c.status },
            { label: 'Duration', value: formatDuration(c.durationMs) },
            { label: 'Source', value: orNone(c.source) },
            { label: 'Request id', value: orNone(c.requestId) },
            { label: 'X-Chaos', value: orNone(c.chaos) },
            { label: 'Body', value: c.bytes === null ? none : formatBytes(c.bytes) },
          ]}
        />
      </Section>
      {c.errorKind ? (
        <Section title="Error">
          <div className={styles.error}>
            <p className={styles.kind}>{c.errorKind}</p>
            <p>{DEFAULT_USER_MESSAGE[c.errorKind]}</p>
            <p className={styles.hint}>{LEARNING_HINT[c.errorKind]}</p>
          </div>
        </Section>
      ) : null}
      <Section title="ResponseMeta">
        {meta ? (
          <div className={styles.meta}>
            <ProvenanceChip meta={meta} />
            <JsonView value={meta} title="ResponseMeta" expandDepth={1} maxHeight={260} copy={false} />
          </div>
        ) : (
          <p className={styles.note}>
            {c.requestId
              ? `No query in the React Query cache holds a response with request id ${c.requestId}. The metadata is stored with query data, so a mutation or an evicted query leaves none.`
              : 'This request never produced a response with a request id, so no stored query result can be tied to it.'}
          </p>
        )}
      </Section>
    </>
  )
}

function rowJson(row: JoinedRow): string {
  return JSON.stringify({ class: row.cls, link: row.link, reason: row.reason, notes: row.notes, client: row.client, server: row.server, replayOf: row.replayOf, meta: findMetaByRequestId(row.client?.requestId ?? null) }, null, 2)
}

export function NetworkDetail({ row, onClose }: { row: JoinedRow | null; onClose: () => void }) {
  const server = row ? serverItems(row) : []
  const reqHeaders = row ? Object.entries((row.server ?? row.replayOf)?.reqHeaders ?? {}) : []
  return (
    <Drawer
      open={row !== null}
      onClose={onClose}
      title={row ? `${row.method} ${row.path}` : 'Request'}
      description={row ? <NetworkStamp cls={row.cls} /> : undefined}
      footer={row ? <CopyButton value={() => rowJson(row)} label="Copy as JSON" size="md" variant="primary" /> : undefined}
    >
      {row ? (
        <div className={styles.stack}>
          <p className={styles.reason}>
            <strong>{CLASS_NAME[row.cls]}.</strong> {row.reason} <span className={styles.meaning}>{CLASS_MEANING[row.cls]}</span>
          </p>
          <Section title="Both sides">
            <KeyValue dense items={summaryItems(row)} />
          </Section>
          <ClientSection row={row} />
          <Section title={row.replayOf ? 'Earlier server entry (the replayed response)' : 'Server entry'}>
            {server.length > 0 ? <KeyValue dense items={server} /> : <p className={styles.note}>The server has no entry for this request.</p>}
          </Section>
          <Section title="Request headers the server logged">
            {reqHeaders.length > 0 ? (
              <KeyValue dense items={reqHeaders.map(([name, value]) => ({ label: name, value }))} />
            ) : (
              <p className={styles.note}>None of the conditional or caching request headers were present (If-None-Match, If-Match, Idempotency-Key, Cache-Control, Range, Purpose).</p>
            )}
          </Section>
        </div>
      ) : null}
    </Drawer>
  )
}
