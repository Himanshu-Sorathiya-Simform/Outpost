import { Button, FieldNotes, Meter, PageHeader, Plate, ProvenanceChip, SeverityStamp, Stat, StatGroup, StatusDot, Tag } from '@/ui'
import { DISPATCHES, SERIES, meta } from '../fixtures'
import { Section } from '../Section'
import k from '../Kitchen.module.css'
import styles from './Overview.module.css'

export function Overview() {
  return (
    <Section id="overview" no={0} title="Overview" lede="The components composed the way a product page uses them: a feed, a summary column, a header that says where its data came from.">
      <PageHeader
        eyebrow="Nº 03 / Log"
        title="Dispatch log"
        description="Filed by operators at 41 stations. Newest first. Nothing on this page is cached unless the provenance chip says so."
        actions={
          <>
            <Button variant="primary" icon="pen">
              File dispatch
            </Button>
            <Button icon="refresh">Refresh</Button>
          </>
        }
        meta={
          <>
            <ProvenanceChip meta={meta('sw-cache')} />
            <Tag tone="accent">148 entries</Tag>
            <Tag>Unread first</Tag>
          </>
        }
      />
      <FieldNotes experiments={['Switch the zone to Lab and watch the accent turn from flare to phosphor.', 'Toggle Night and compare the stamps: the border style still tells you the severity.', 'Set density to Tight and check that every row stays above 24px.']}>
        <p>Dispatches are the product. Each row is a register line: a severity stamp, the title as the operator wrote it, and a hairline of metadata. The page header carries the provenance of the whole list.</p>
      </FieldNotes>
      <div className={k.asym}>
        <Plate index={148} title="Latest dispatches" actions={<Tag tone="error">3 unread</Tag>} flush footer="Sorted by filing time. Filters live in the URL.">
          <ul className={styles.feed}>
            {DISPATCHES.map((d) => (
              <li key={d.id} className={styles.entry} data-unread={d.unread || undefined}>
                <span className={styles.no}>{d.id.slice(-3)}</span>
                <div className={styles.main}>
                  <a href={`#${d.id}`} className={styles.title}>
                    {d.title}
                  </a>
                  <p className={styles.meta}>
                    {d.code} / filed by {d.by} / {d.at}
                  </p>
                  <div className={k.row}>
                    {d.tags.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>
                </div>
                <SeverityStamp severity={d.severity} />
              </li>
            ))}
          </ul>
        </Plate>
        <div className={k.stack}>
          <StatGroup>
            <Stat label="Unread" value={3} tone="accent" trend={SERIES} note="+2 since 06:00" />
            <Stat label="Urgent" value={2} tone="error" note="1 critical" />
            <Stat label="Stations" value={41} note="38 online" />
            <Stat label="Signal" value="-71" unit="dBm" note="median" />
          </StatGroup>
          <Plate title="Relay" index="Fig. 2">
            <div className={k.stack}>
              <Meter label="Queue depth" value={4} max={20} valueText="4 of 20" tone="ok" />
              <Meter label="Battery, KRN-07" value={38} tone="warn" />
              <Meter label="Link quality" value={12} tone="error" />
              <div className={k.row}>
                <StatusDot tone="ok" label="Online" />
                <StatusDot tone="warn" label="Degraded" />
                <StatusDot tone="error" label="Dark" />
              </div>
            </div>
          </Plate>
        </div>
      </div>
    </Section>
  )
}
