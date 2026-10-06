import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Button, EmptyState, FieldNotes, KeyValue, LinkButton, PageHeader, Plate } from '@/ui'
import { Notice } from '../components/Notice'
import { composeHref, describeDropped } from '../form/prefill'
import { SAMPLE_SHARE_HREF, preview, readShare, type IncomingShare } from '../share/share-params'
import styles from './ShareTargetPage.module.css'

const TEXT_PREVIEW = 600

function Received({ share }: { share: IncomingShare }) {
  const text = preview(share.text, TEXT_PREVIEW)
  const title = preview(share.title, 160)
  const none = <span className={styles.none}>Not included</span>
  return (
    <KeyValue
      layout="stacked"
      items={[
        { label: 'Title', mono: false, value: share.title ? <span className={styles.value}>{title.shown}</span> : none },
        {
          label: 'Text',
          mono: false,
          value: share.text ? (
            <span className={styles.value}>
              {text.shown}
              {text.cut > 0 ? <span className={styles.cut}> ({text.cut} more characters, not shown in this preview)</span> : null}
            </span>
          ) : (
            none
          ),
        },
        { label: 'Link', value: share.url ? <span className={styles.value}>{share.url}</span> : none },
      ]}
    />
  )
}

function ReviewShare({ share }: { share: IncomingShare }) {
  const navigate = useNavigate()
  const href = composeHref({ title: share.title, text: share.text, url: share.url ?? undefined })
  return (
    <>
      <PageHeader
        eyebrow="Register / Incoming"
        title="Incoming share"
        description="Something was shared to Outpost from another app. Nothing has been filed. Review it, then turn it into a dispatch or throw it away."
      />
      <div className={styles.review}>
        <Plate index="Fig. 1" title="What was received" actions={<span className={styles.tip}>Shown as plain text</span>}>
          <Received share={share} />
          {describeDropped(share.dropped).map((note) => (
            <Notice key={note} tone="warn" className={styles.note}>
              {note}
            </Notice>
          ))}
          {share.urlInText ? (
            <Notice tone="info" className={styles.note}>
              A link was found inside the text: <span className={styles.value}>{share.urlInText}</span>. It stays in the text.
            </Notice>
          ) : null}
          {share.urlRejected ? (
            <Notice tone="warn" className={styles.note}>
              The link field held something that is not a web address. It was dropped.
            </Notice>
          ) : null}
        </Plate>
        <Plate index="Fig. 2" title="What happens next" surface="sunk">
          <p className={styles.lede}>
            The dispatch form opens with this filled in. You choose the station and check the wording; it is kept as a draft from the first moment.
          </p>
          <div className={styles.actions}>
            <LinkButton to={href} variant="primary" icon="pen">
              Create dispatch from this
            </LinkButton>
            <Button variant="ghost" icon="trash" onClick={() => void navigate('/log', { replace: true })}>
              Discard
            </Button>
          </div>
        </Plate>
      </div>
    </>
  )
}

function NothingShared() {
  return (
    <>
      <PageHeader
        eyebrow="Register / Incoming"
        title="Incoming share"
        description="This is where the system share sheet lands once Outpost is registered as a share target."
      />
      <Plate index="Fig. 1" title="Nothing has been shared">
        <EmptyState
          compact
          icon="share"
          title="No title, text or link arrived"
          action={
            <LinkButton to={SAMPLE_SHARE_HREF} icon="play">
              Try a sample share
            </LinkButton>
          }
        >
          Opened directly, this page has nothing to review. The sample sends it a title and some text, exactly as a share sheet would.
        </EmptyState>
      </Plate>
      <FieldNotes
        title="How this page is reached"
        experimentsLabel="Try"
        experiments={[
          'Open the sample and create a dispatch from it: the form arrives filled in and already saved as a draft.',
          'Share a page from Chrome on Android once the manifest below is in place and Outpost appears in the share sheet.',
        ]}
      >
        <p>
          A web app becomes a share target when its manifest declares <code>share_target</code> with an action of <code>/share-target</code>. With{' '}
          <code>method: GET</code> the operating system opens this page with <code>?title=</code>, <code>?text=</code> and <code>?url=</code> in the query
          string, which is all this page reads.
        </p>
        <p>
          A POST target, needed for shared files, sends a form post instead. A service worker has to catch that request, keep the data, and redirect here;
          without one the server sees a POST it has no route for.
        </p>
      </FieldNotes>
    </>
  )
}

/** Web Share Target landing page. It never redirects by itself: what was shared is shown first, and a person decides. */
export default function ShareTargetPage() {
  const [params] = useSearchParams()
  const share = useMemo(() => readShare(params), [params])
  return share.received ? <ReviewShare share={share} /> : <NothingShared />
}
