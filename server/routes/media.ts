/**
 * Generated contour art. The artificial delay (40-120 ms) is there so the difference between
 * a cache answer and a network answer is visible in the waterfall. Mount at the application root.
 */
import type { Request, Response } from 'express'
import { renderArt, type ArtSpec } from '../media'
import { store } from '../store'
import { HttpError, addNote, asyncRoute, exactRouter, ifNoneMatch, sleep, weakEtag } from '../util'

export const mediaRouter = exactRouter()

async function sendArt(req: Request, res: Response, spec: ArtSpec): Promise<void> {
  await sleep(40 + Math.floor(Math.random() * 81))
  const svg = renderArt(spec)
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
  res.setHeader('ETag', weakEtag(svg))
  if (ifNoneMatch(req, res.getHeader('ETag')?.toString())) {
    addNote(res, 'etag-304')
    res.status(304).end()
    return
  }
  res.setHeader('Content-Length', Buffer.byteLength(svg))
  res.end(svg)
}

mediaRouter.get(
  '/media/dispatch/:id.svg',
  asyncRoute(async (req, res) => {
    const dispatch = store.getDispatch(req.params.id)
    if (!dispatch) throw new HttpError(404, 'not_found', `No dispatch ${req.params.id}`)
    const number = Number.parseInt(dispatch.id.replace(/\D/g, ''), 10)
    await sendArt(req, res, {
      variant: 'dispatch',
      seed: dispatch.id,
      index: `№ ${String(number).padStart(4, '0')}`,
      caption: `${dispatch.stationCode} / ${dispatch.severity}`,
    })
  }),
)

mediaRouter.get(
  '/media/station/:code.svg',
  asyncRoute(async (req, res) => {
    const station = store.getStation(req.params.code)
    if (!station) throw new HttpError(404, 'not_found', `No station ${req.params.code}`)
    await sendArt(req, res, { variant: 'station', seed: station.code, index: station.code, caption: `${station.name} / ${station.elevationM} m` })
  }),
)
