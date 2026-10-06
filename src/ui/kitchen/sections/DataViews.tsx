import { useState } from 'react'
import { CodeBlock, JsonView, KeyValue, LogList, Meter, Plate, SeverityStamp, Sparkline, Stat, StatGroup, StatusDot, Table, TBody, Td, Th, THead, Tr, Tabs, Timeline, type LogEntry } from '@/ui'
import { SERIES, STATIONS } from '../fixtures'
import { Section } from '../Section'
import k from '../Kitchen.module.css'

const LOG: LogEntry[] = [
  { id: 1, at: '2026-09-30T08:14:01.120Z', level: 'info', source: 'net', message: 'GET /api/dispatches?limit=12', detail: '200 in 184 ms, 18.4 KB' },
  { id: 2, at: '2026-09-30T08:14:01.340Z', level: 'ok', source: 'query', message: 'dispatches: fresh for 30 s' },
  { id: 3, at: '2026-09-30T08:14:09.002Z', level: 'warn', source: 'net', message: 'GET /api/signal took 4.2 s', detail: 'X-Chaos: Lie-fi' },
  { id: 4, at: '2026-09-30T08:14:14.731Z', level: 'error', source: 'net', message: 'POST /api/dispatches failed: network', detail: 'Queued for background sync' },
  { id: 5, at: '2026-09-30T08:14:15.004Z', level: 'debug', source: 'seam', message: 'sync.queueDispatch -> not-implemented' },
]

const SPARKS: Array<{ caption: string; label: string; values: number[]; variant?: 'line' | 'step' | 'bars' }> = [
  { caption: 'Line', label: 'Latency', values: SERIES },
  { caption: 'Step', label: 'Steps', values: SERIES, variant: 'step' },
  { caption: 'Bars', label: 'Samples', values: SERIES, variant: 'bars' },
  { caption: 'Empty', label: 'Nothing yet', values: [] },
]

const PAYLOAD: Record<string, unknown> = {
  id: 'dp-000148',
  severity: 'urgent',
  tags: ['mast', 'icing'],
  coords: { lat: 67.3321, lng: 18.0442 },
  read: false,
  rev: 7,
  note: null,
  history: Array.from({ length: 4 }, (_, i) => ({ rev: i + 1, at: `2026-09-30T0${i + 4}:10:00Z` })),
}
PAYLOAD.self = PAYLOAD

export function DataViews() {
  const [sort, setSort] = useState<'asc' | 'desc' | 'none'>('none')
  const rows = sort === 'none' ? STATIONS : [...STATIONS].sort((a, b) => (sort === 'asc' ? 1 : -1) * a.code.localeCompare(b.code))
  return (
    <Section id="data" no={3} title="Data" lede="Ledger tables with rules instead of zebra stripes, dot-leader lists, figures and logs set in tabular mono.">
      <Plate index={12} title="Stations" flush>
        <Table caption="Stations and last contact" minWidth={620}>
          <THead>
            <Tr>
              <Th onSort={() => setSort(sort === 'asc' ? 'desc' : sort === 'desc' ? 'none' : 'asc')} sort={sort}>
                Code
              </Th>
              <Th>Name</Th>
              <Th>Kind</Th>
              <Th numeric>Crew</Th>
              <Th numeric>Elev. m</Th>
              <Th>Status</Th>
              <Th numeric>Last contact</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.map((s) => (
              <Tr key={s.code} flag={s.status === 'online' ? undefined : s.status === 'degraded' ? 'warn' : 'error'} selected={s.code === 'KRN-07'}>
                <Td mono>{s.code}</Td>
                <Td>{s.name}</Td>
                <Td>{s.kind}</Td>
                <Td numeric>{s.crew}</Td>
                <Td numeric>{s.elevation.toLocaleString('en')}</Td>
                <Td>
                  <StatusDot tone={s.status === 'online' ? 'ok' : s.status === 'degraded' ? 'warn' : 'error'} label={s.status} />
                </Td>
                <Td numeric nowrap>
                  {s.contact}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Plate>

      <div className={k.grid2}>
        <Plate title="Key / value" index="Fig. 7">
          <KeyValue
            items={[
              { label: 'Station', value: 'KRN-07 Kirna Ridge' },
              { label: 'Elevation', value: '1,840 m' },
              { label: 'Last contact', value: '2026-09-30 08:12' },
              { label: 'Uplink', value: 'relay-north-2 via /api/signal?station=KRN-07&window=30m' },
              { label: 'Severity', value: <SeverityStamp severity="urgent" size="sm" />, mono: false },
            ]}
          />
        </Plate>
        <div className={k.stack}>
          <StatGroup>
            <Stat label="Latency" value="184" unit="ms" trend={SERIES} note="p50, last 12" />
            <Stat label="Cache hits" value="72" unit="%" tone="ok" />
            <Stat label="Failures" value={3} tone="error" />
          </StatGroup>
          <Plate title="Sparklines and meter" index="Fig. 7b">
            <div className={k.stack}>
              <div className={k.row}>
                {SPARKS.map((s) => (
                  <figure key={s.caption} className={k.specimen}>
                    <Sparkline label={s.label} values={s.values} variant={s.variant} width={88} height={40} />
                    <figcaption className="label">{s.caption}</figcaption>
                  </figure>
                ))}
              </div>
              <Meter label="Storage used" value={38} max={120} valueText="38 of 120 MB" tone="info" />
            </div>
          </Plate>
        </div>
      </div>

      <div className={k.grid2}>
        <Plate title="Timeline" index="Fig. 8">
          <Timeline
            label="Service worker lifecycle"
            items={[
              { id: 'a', at: '2026-09-30T08:01:00Z', title: 'Installing', tone: 'info', icon: 'download', detail: 'Precaching 14 files into shell-v4.' },
              { id: 'b', at: '2026-09-30T08:01:02Z', title: 'Waiting', tone: 'warn', icon: 'clock', detail: 'Another worker is still controlling two tabs.', meta: 'v3 active' },
              { id: 'c', at: '2026-09-30T08:03:40Z', title: 'Activated', tone: 'ok', icon: 'check' },
              { id: 'd', at: '2026-09-30T08:04:10Z', title: 'Redundant', icon: 'x' },
            ]}
          />
        </Plate>
        <Plate title="Log" index="Fig. 9" flush>
          <LogList label="Client network log" entries={LOG} maxHeight={250} />
        </Plate>
      </div>

      <div className={k.grid2}>
        <Tabs
          label="Payload views"
          defaultValue="json"
          items={[
            { id: 'json', label: 'Tree', count: 8, content: <JsonView value={PAYLOAD} title="GET /api/dispatches/dp-000148" maxHeight={300} /> },
            { id: 'raw', label: 'Raw', content: <CodeBlock language="http" title="Response" lineNumbers code={'HTTP/1.1 200 OK\nContent-Type: application/json\nETag: W/"dp-000148-r7"\nX-Resource-Rev: 7\nCache-Control: no-cache'} /> },
            { id: 'off', label: 'Diff', disabled: true, content: null },
          ]}
        />
        <CodeBlock language="ts" title="sw.js" wrap maxHeight={220} code={"self.addEventListener('fetch', (event) => {\n  if (event.request.method !== 'GET') return\n  event.respondWith(staleWhileRevalidate(event.request))\n})"} />
      </div>
    </Section>
  )
}
