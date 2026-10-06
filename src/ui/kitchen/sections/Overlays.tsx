import { useRef, useState } from 'react'
import { Button, Dialog, Disclosure, Drawer, Field, Input, Plate } from '@/ui'
import { Section } from '../Section'
import k from '../Kitchen.module.css'

type Open = null | 'dialog' | 'alert' | 'drawer' | 'left'

export function Overlays() {
  const [open, setOpen] = useState<Open>(null)
  const callsign = useRef<HTMLInputElement>(null)
  const close = (): void => setOpen(null)
  return (
    <Section id="overlays" no={5} title="Overlays" lede="Dialogs and drawers are native modal dialogs: focus trapped, background inert, Esc closes, focus returns to the button that opened them.">
      <div className={k.grid2}>
        <Plate title="Modal surfaces" index="Fig. 12">
          <div className={k.row}>
            <Button onClick={() => setOpen('dialog')}>Clock in</Button>
            <Button variant="danger" onClick={() => setOpen('alert')}>
              Clear all caches
            </Button>
            <Button onClick={() => setOpen('drawer')}>Filters</Button>
            <Button onClick={() => setOpen('left')}>Menu</Button>
          </div>
        </Plate>
        <Plate title="Disclosure" index="Fig. 13" flush>
          <Disclosure summary="Why is this stale?" meta="3 facts">
            <p>The worker answered from the cache and revalidated in the background. The copy on screen is four minutes old; the fresh one lands in the cache for next time.</p>
          </Disclosure>
          <Disclosure summary="Request headers" defaultOpen variant="rule">
            <p className="mono">If-None-Match: W/&quot;dp-000148-r7&quot;</p>
          </Disclosure>
          <Disclosure summary="Boxed variant" variant="boxed">
            <p>Used inside plates where the rule variant would collide with a header.</p>
          </Disclosure>
        </Plate>
      </div>

      <Dialog
        open={open === 'dialog'}
        onClose={close}
        title="Clock in"
        description="Your shift lapsed. Enter your callsign to keep filing."
        initialFocusRef={callsign}
        footer={
          <>
            <Button variant="quiet" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={close}>
              Clock in
            </Button>
          </>
        }
      >
        <Field label="Callsign" hint="2 to 16 letters, digits or dashes.">
          <Input ref={callsign} defaultValue="HALDEN" />
        </Field>
      </Dialog>
      <Dialog
        open={open === 'alert'}
        onClose={close}
        role="alertdialog"
        size="sm"
        dismissible={false}
        title="Clear all caches?"
        description="The app will need a connection for its next load."
        footer={
          <>
            <Button onClick={close} data-autofocus>
              Keep them
            </Button>
            <Button variant="danger" onClick={close}>
              Clear
            </Button>
          </>
        }
      >
        <p>Five caches, 38 MB, will be deleted. This cannot be undone.</p>
      </Dialog>
      <Drawer open={open === 'drawer'} onClose={close} title="Filters" description="Applied to the dispatch log.">
        <div className={k.stack}>
          <Field label="Station">
            <Input placeholder="KRN-07" />
          </Field>
          <Field label="Text">
            <Input leading="search" placeholder="icing, generator" />
          </Field>
          <Button variant="primary" onClick={close}>
            Apply
          </Button>
        </div>
      </Drawer>
      <Drawer open={open === 'left'} onClose={close} side="left" title="Menu">
        <p>Left-edge drawer for navigation on narrow screens.</p>
      </Drawer>
    </Section>
  )
}
