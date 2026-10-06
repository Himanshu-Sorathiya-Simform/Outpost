import { useState } from 'react'
import { Button, Checkbox, Field, Input, Plate, Segmented, Select, Switch, Textarea } from '@/ui'
import { Section } from '../Section'
import k from '../Kitchen.module.css'

type Sev = 'routine' | 'notice' | 'urgent' | 'critical'

export function Forms() {
  const [sev, setSev] = useState<Sev>('notice')
  const [push, setPush] = useState(true)
  const [bg, setBg] = useState(false)
  const [all, setAll] = useState<boolean | 'mixed'>('mixed')
  const [body, setBody] = useState('Icing on the upper guy wires, about 15 mm. Climbing suspended until the wind drops.')
  return (
    <Section id="forms" no={2} title="Forms" lede="Entry lines sunk into the page, labels above, validation text that carries an icon as well as a colour.">
      <div className={k.asym}>
        <Plate index={7} title="File a dispatch" footer="Drafts are kept on this device until the relay accepts them.">
          <form className={k.stack} onSubmit={(e) => e.preventDefault()} noValidate>
            <div className={k.grid2}>
              <Field label="Station" required hint="Where you are standing, not where the signal is.">
                <Select options={[{ value: 'krn', label: 'KRN-07  Kirna Ridge' }, { value: 'vlk', label: 'VLK-02  Valkeri Flats' }, { value: 'nrd', label: 'NRD-04  North Reach (dark)', disabled: true }]} defaultValue="krn" />
              </Field>
              <Field label="Search stations" labelHidden>
                <Input leading="search" placeholder="Search stations" />
              </Field>
            </div>
            <Field label="Title" required error="Titles need at least 3 characters.">
              <Input defaultValue="Ic" />
            </Field>
            <Field label="Body" hint="Plain text. Say what you saw, then what you did.">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={140} count rows={4} />
            </Field>
            <Segmented<Sev>
              label="Severity"
              showLabel
              value={sev}
              onChange={setSev}
              options={[
                { value: 'routine', label: 'Routine' },
                { value: 'notice', label: 'Notice' },
                { value: 'urgent', label: 'Urgent' },
                { value: 'critical', label: 'Critical' },
              ]}
            />
            <div className={k.row}>
              <Button type="submit" variant="primary" icon="send">
                File dispatch
              </Button>
              <Button variant="ghost">Save draft</Button>
              <Button variant="quiet">Discard</Button>
            </div>
          </form>
        </Plate>
        <div className={k.stack}>
          <Plate title="Preferences" index="Fig. 4">
            <div className={k.stack}>
              <Switch checked={push} onChange={setPush} label="Urgent alerts" description="Push a notice for urgent and critical dispatches." />
              <Switch checked={bg} onChange={setBg} label="Background refresh" description="Fetch the digest while the app is closed." />
              <Switch checked={false} onChange={() => undefined} label="Quiet hours" description="Not available in this browser." disabled />
              <Switch checked onChange={() => undefined} label="Locked on" disabled />
            </div>
          </Plate>
          <Plate title="Checkboxes" index="Fig. 5">
            <div className={k.stack}>
              <Checkbox label="All stations" indeterminate={all === 'mixed'} checked={all === true} onChange={(e) => setAll(e.target.checked)} />
              <Checkbox label="Kirna Ridge" description="Radio relay, 3 crew" defaultChecked />
              <Checkbox label="Valkeri Flats" />
              <Checkbox label="North Reach" description="Dark since Sunday" disabled />
              <Checkbox label="Accept the terms of the field manual" invalid />
            </div>
          </Plate>
          <Plate title="Disabled and read-only" index="Fig. 6">
            <div className={k.stack}>
              <Field label="Callsign">
                <Input defaultValue="HALDEN" readOnly />
              </Field>
              <Field label="Region">
                <Input defaultValue="Unavailable offline" disabled />
              </Field>
            </div>
          </Plate>
        </div>
      </div>
    </Section>
  )
}
