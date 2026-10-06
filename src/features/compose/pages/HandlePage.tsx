import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Icon, KeyValue, LinkButton, Loader, PageHeader, Plate } from '@/ui'
import { Notice } from '../components/Notice'
import { cleanLine } from '../form/sanitize'
import { HANDLE_EXAMPLES, handleHref, parseHandleUri, type HandleKind } from '../handle/handle-uri'
import styles from './HandlePage.module.css'

const KIND_WORD: Record<HandleKind, string> = { dispatch: 'dispatch', station: 'station', handbook: 'handbook chapter' }

function Opening({ kind, id, path }: { kind: HandleKind; id: string; path: string }) {
  const navigate = useNavigate()
  useEffect(() => {
    void navigate(path, { replace: true })
  }, [navigate, path])
  return (
    <>
      <PageHeader eyebrow="Register / Link" title="Opening" description={`${KIND_WORD[kind]} ${id}`} />
      <div className={styles.opening} role="status">
        <Loader label={`Opening ${KIND_WORD[kind]} ${id}`} />
        <p className={styles.small}>
          If nothing happens, <Link to={path}>open it yourself</Link>.
        </p>
      </div>
    </>
  )
}

/**
 * Landing page for the web+outpost: protocol handler. It opens only what the allow-list names (dispatch, station,
 * handbook chapter) and does so with replace, so Back skips this page. Anything else is explained, not followed.
 */
export default function HandlePage() {
  const [params] = useSearchParams()
  const raw = params.get('uri')
  const parsed = parseHandleUri(raw)
  if (parsed.ok) return <Opening {...parsed.target} />

  const received = raw === null ? null : cleanLine(raw, 160)
  return (
    <>
      <PageHeader
        eyebrow="Register / Link"
        title="Not an Outpost link"
        description="This page opens web+outpost:// addresses handed over by the operating system. It only follows the three forms below, and never an arbitrary address."
      />
      <div className={styles.split}>
        <Plate index="Fig. 1" title="What arrived">
          <Notice tone="warn">{parsed.message}</Notice>
          <div className={styles.received}>
            <KeyValue
              items={[
                {
                  label: 'uri',
                  value:
                    received === null ? (
                      <span className={styles.none}>Not passed</span>
                    ) : received === '' ? (
                      <span className={styles.none}>Empty</span>
                    ) : (
                      received
                    ),
                },
              ]}
            />
          </div>
          <div className={styles.links}>
            <LinkButton to="/log" icon="log">
              Log
            </LinkButton>
            <LinkButton to="/stations" icon="station">
              Stations
            </LinkButton>
            <LinkButton to="/handbook" icon="book">
              Handbook
            </LinkButton>
          </div>
        </Plate>
        <Plate index="Fig. 2" title="Addresses it opens" surface="sunk">
          <ul className={styles.examples}>
            {HANDLE_EXAMPLES.map((e) => (
              <li key={e.uri}>
                <code className={styles.uri}>{e.uri}</code>
                <span className={styles.meaning}>{e.meaning}</span>
                <Link className={styles.try} to={handleHref(e.uri)}>
                  Try this <Icon name="arrow-right" size={14} />
                </Link>
              </li>
            ))}
          </ul>
          <p className={styles.small}>
            A browser passes the address in as <code>?uri=</code>, percent-encoded once, once the manifest lists a protocol handler with{' '}
            <code>/handle?uri=%s</code> as its URL.
          </p>
        </Plate>
      </div>
    </>
  )
}
