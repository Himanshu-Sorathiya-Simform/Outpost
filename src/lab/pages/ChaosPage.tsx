import { FieldNotes, LinkButton, PageHeader } from '@/ui'
import { ChaosConsole } from '../components/ChaosConsole'

export default function ChaosPage() {
  return (
    <>
      <PageHeader
        eyebrow="Lab / Nº 07"
        title="Chaos"
        description="Break the server on purpose, then watch what the client makes of it."
        actions={
          <LinkButton to="/lab/network" icon="network" variant="ghost">
            Watch the traffic
          </LinkButton>
        }
      />
      <FieldNotes
        experiments={[
          <>Switch on <em>Captive portal</em>, reload the stations page, then switch it off. If your worker cached that HTML page as if it were the station list, it will keep serving it.</>,
          <>Switch on <em>Lie-fi</em>, set the probe to give up after 2 s and fire the signal board five times. All five time out. With network-first and no timeout they would have waited up to nine seconds.</>,
          <>Turn on <em>Schema drift</em> and fire at the dispatch list, then at stations. One is rejected by its contract, the other never notices.</>,
          <>Enable two rules that overlap and use <em>Would match</em> to see which one answers. Move the lower one up and ask again.</>,
        ]}
      >
        DevTools throttling is client-side: the browser slows or blocks a request it was about to send, and your service worker still sees an honest, slow network. Chaos is server-side: the relay itself misbehaves, so what
        reaches the browser is already wrong, such as HTML where JSON was promised, a body cut in half, a 429 with a Retry-After. Throttling teaches you how fast your strategies are. Chaos teaches you what they do with bad
        bytes, including a 200 that is a lie. The state lives on the server and survives a reload; /api/_lab is exempt, so the way out always works.
      </FieldNotes>
      <ChaosConsole />
    </>
  )
}
