import { Button, CopyButton, IconButton, Kbd, LinkButton, Logo, SeverityStamp, StatusDot, Tag, type ButtonSize, type ButtonVariant } from '@/ui'
import { SEVERITIES } from '@shared/contracts'
import { Section, Specimen } from '../Section'
import k from '../Kitchen.module.css'

const VARIANTS: ButtonVariant[] = ['primary', 'ghost', 'danger', 'quiet']
const SIZES: ButtonSize[] = ['sm', 'md', 'lg']

export function Actions() {
  return (
    <Section id="actions" no={1} title="Actions and marks" lede="Buttons are slabs with a hard shadow that they sink into when pressed. Marks (stamps, dots, tags) never rely on colour alone.">
      <div className={k.grid2}>
        <Specimen label="Button / variants and sizes">
          {SIZES.map((s) => (
            <div key={s} className={k.row}>
              {VARIANTS.map((v) => (
                <Button key={v} variant={v} size={s}>
                  {v}
                </Button>
              ))}
            </div>
          ))}
        </Specimen>
        <Specimen label="Button / icons, loading, disabled">
          <div className={k.row}>
            <Button variant="primary" icon="send">
              Send
            </Button>
            <Button icon="download" iconEnd="chevron-down">
              Export
            </Button>
            <Button variant="danger" icon="trash">
              Discard
            </Button>
          </div>
          <div className={k.row}>
            <Button variant="primary" loading>
              Sending
            </Button>
            <Button loading>Retrying</Button>
            <Button disabled>Disabled</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
        </Specimen>
        <Specimen label="IconButton / toggles">
          <div className={k.row}>
            <IconButton icon="star" label="Star dispatch" />
            <IconButton icon="star" label="Starred" pressed filled />
            <IconButton icon="bell" label="Notifications" variant="primary" />
            <IconButton icon="trash" label="Delete" variant="danger" />
            <IconButton icon="more" label="More" variant="quiet" />
            <IconButton icon="search" label="Search" size="sm" />
            <IconButton icon="menu" label="Menu" size="lg" />
            <IconButton icon="x" label="Disabled close" disabled />
          </div>
        </Specimen>
        <Specimen label="LinkButton and CopyButton">
          <div className={k.row}>
            <LinkButton to="/log" variant="primary" iconEnd="arrow-right">
              Open log
            </LinkButton>
            <LinkButton href="https://example.com" external>
              Field manual
            </LinkButton>
            <CopyButton value="KRN-07 / dp-000148" label="Copy reference" />
            <CopyButton value="dp-000148" label="Copy id" iconOnly />
          </div>
          <p>
            Shortcuts: <Kbd keys="Esc" /> closes, <Kbd keys={['Ctrl', 'K']} /> searches, <Kbd keys={['Shift', 'R']} /> hard reloads.
          </p>
        </Specimen>
        <Specimen label="SeverityStamp / level by border, not hue" wide>
          <div className={k.row} style={{ gap: 'var(--space-5)' }}>
            {SEVERITIES.map((s) => (
              <SeverityStamp key={s} severity={s} size="lg" />
            ))}
            {SEVERITIES.map((s) => (
              <SeverityStamp key={`f-${s}`} severity={s} size="sm" flat />
            ))}
          </div>
        </Specimen>
        <Specimen label="Tag">
          <div className={k.row}>
            <Tag>mast</Tag>
            <Tag tone="accent">flare</Tag>
            <Tag tone="ok" icon="check">
              Stored
            </Tag>
            <Tag tone="warn" icon="warning">
              Stale
            </Tag>
            <Tag tone="error" icon="x">
              Failed
            </Tag>
            <Tag tone="info" icon="info">
              Revalidating
            </Tag>
            <Tag tone="accent" solid>
              Solid
            </Tag>
            <Tag onRemove={() => undefined} removeLabel="Remove filter KRN-07">
              KRN-07
            </Tag>
          </div>
        </Specimen>
        <Specimen label="StatusDot / one shape per state">
          <div className={k.row}>
            <StatusDot tone="ok" label="ok" />
            <StatusDot tone="warn" label="warn" />
            <StatusDot tone="error" label="error" />
            <StatusDot tone="info" label="info" />
            <StatusDot tone="idle" label="idle" />
            <StatusDot tone="ok" live label="live" />
            <StatusDot tone="error" title="Dark" />
          </div>
        </Specimen>
        <Specimen label="Logo">
          <div className={k.row} style={{ gap: 'var(--space-6)' }}>
            <Logo size={40} caption="Relay network" />
            <Logo variant="mark" size={40} />
            <Logo variant="wordmark" size={28} />
          </div>
        </Specimen>
      </div>
    </Section>
  )
}
