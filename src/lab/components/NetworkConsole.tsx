import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Plate, Tabs, type TabItem } from '@/ui'
import { NetworkClientLog } from './NetworkClientLog'
import { NetworkFeedPill } from './NetworkFeedPill'
import { NetworkJoined } from './NetworkJoined'
import { NetworkResources } from './NetworkResources'
import { NetworkServerLog } from './NetworkServerLog'
import { NetworkSummary } from './NetworkSummary'
import { NO_FILTERS, summarise, type NetFilters } from './NetworkStats'
import { useNetworkData, useTail } from './useNetworkRows'
import { useResourceLog } from '@/lib'

const TAB_IDS = ['joined', 'client', 'server', 'resources'] as const
type TabId = (typeof TAB_IDS)[number]
const isTab = (v: string | null): v is TabId => TAB_IDS.some((t) => t === v)

/** The page body: summary strip, feed status, and the four views of the same traffic. */
export function NetworkConsole() {
  const { rows, client, server, feed } = useNetworkData()
  const resources = useResourceLog((s) => s.entries.length)
  const tail = useTail(rows)
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const tab: TabId = isTab(requested) ? requested : 'joined'
  const [filters, setFilters] = useState<NetFilters>(() => ({ ...NO_FILTERS, text: params.get('q') ?? '' }))

  const items: TabItem[] = [
    { id: 'joined', label: 'Joined', icon: 'network', count: rows.length, content: <NetworkJoined tail={tail} filters={filters} onFilters={setFilters} /> },
    { id: 'client', label: 'Client', icon: 'window', count: client.length, content: <NetworkClientLog /> },
    { id: 'server', label: 'Server', icon: 'server', count: server.length, content: <NetworkServerLog /> },
    { id: 'resources', label: 'Resources', icon: 'download', count: resources, content: <NetworkResources /> },
  ]

  return (
    <>
      <NetworkSummary summary={summarise(rows, client)} />
      <Plate
        index="Nº 0601"
        title="Request ledger"
        actions={<NetworkFeedPill status={feed} />}
      >
        <Tabs
          label="Network views"
          items={items}
          value={tab}
          onChange={(id) => {
            const next = new URLSearchParams(params)
            if (id === 'joined') next.delete('tab')
            else next.set('tab', id)
            setParams(next, { replace: true })
          }}
        />
      </Plate>
    </>
  )
}
