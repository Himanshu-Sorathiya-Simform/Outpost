import type { StationKind, StationStatus } from '../../shared/contracts'

/**
 * The ten stations of the Outpost relay network. Places are invented; coordinates only
 * need to look right on a map of the region. The store derives ids as
 * 'st-' + code.toLowerCase().replace('-', '') and owns lastContactAt and rev.
 */
export interface StationSeed {
  code: string
  name: string
  region: string
  kind: StationKind
  status: StationStatus
  lat: number
  lng: number
  elevationM: number
  crew: number
  blurb: string
}

export const STATION_SEEDS: StationSeed[] = [
  {
    code: 'KRN-07',
    name: 'Kerrin Skerry',
    region: 'Varne Coast',
    kind: 'coastal',
    status: 'online',
    lat: 70.9812,
    lng: 25.417,
    elevationM: 11,
    crew: 3,
    blurb:
      "A keeper's house on a rock half a kilometre off the coast, reached by boat when the swell allows and across the ice when it does not. The barograph is older than the radio and has been right more often.",
  },
  {
    code: 'OST-09',
    name: 'Ostby Quay',
    region: 'Varne Coast',
    kind: 'coastal',
    status: 'online',
    lat: 70.6388,
    lng: 28.8915,
    elevationM: 6,
    crew: 1,
    blurb:
      'One operator, one tide gauge, one stove with opinions. The concrete quay dates from 1962 and is the only flat surface for forty kilometres.',
  },
  {
    code: 'HLV-02',
    name: 'Halvard Col',
    region: 'Tessaly Range',
    kind: 'weather',
    status: 'degraded',
    lat: 68.2146,
    lng: 17.9483,
    elevationM: 1386,
    crew: 2,
    blurb:
      'Wind and precipitation on a bare col above the last stunted birch. The main anemometer is down a cup and the crew has stopped apologising for it.',
  },
  {
    code: 'VLD-13',
    name: 'Velden Bore',
    region: 'Tessaly Range',
    kind: 'seismic',
    status: 'dark',
    lat: 68.0531,
    lng: 18.4206,
    elevationM: 870,
    crew: 2,
    blurb:
      'A seismometer vault drilled into bedrock, a hut, and a solar array that faces the one patch of sky the ridge allows. The quietest station in the network by design, and lately by circumstance.',
  },
  {
    code: 'GLM-12',
    name: 'Glamsdal Ridge',
    region: 'Tessaly Range',
    kind: 'radio-relay',
    status: 'online',
    lat: 68.3374,
    lng: 18.6102,
    elevationM: 1650,
    crew: 1,
    blurb:
      'A relay hut tied to the ridge with four steel cables above the icefall. The wind here is said to keep a timetable. Nobody has found a copy.',
  },
  {
    code: 'SKR-11',
    name: 'Skarra Tongue',
    region: 'Saint Ansgar Land',
    kind: 'glacier',
    status: 'online',
    lat: 72.6417,
    lng: -24.183,
    elevationM: 640,
    crew: 4,
    blurb:
      'Stake lines across the snout of a retreating glacier. The camp moves uphill about once a season and the published map follows a few years later.',
  },
  {
    code: 'BRD-08',
    name: 'Bredon Nunatak',
    region: 'Saint Ansgar Land',
    kind: 'seismic',
    status: 'online',
    lat: 72.1124,
    lng: -25.0347,
    elevationM: 1790,
    crew: 2,
    blurb:
      'A broadband seismometer bolted to rock that has been rock for a very long time. The hut is the newest object within a hundred square kilometres and looks it.',
  },
  {
    code: 'TLV-04',
    name: 'Tulvik Mast',
    region: 'Brannock Plateau',
    kind: 'radio-relay',
    status: 'degraded',
    lat: 64.8731,
    lng: -18.612,
    elevationM: 1120,
    crew: 2,
    blurb:
      'A guyed mast on the plateau carrying the traffic of three stations. Icing is the usual complaint, and the feeder connector is the current one.',
  },
  {
    code: 'RVN-01',
    name: 'Ravn Holm',
    region: 'Ravn Islands',
    kind: 'weather',
    status: 'online',
    lat: 79.4165,
    lng: 11.2839,
    elevationM: 37,
    crew: 5,
    blurb:
      'The largest crew in the network and the only kettle with a waiting list. Balloon at 0500 and 1700, bears at their own convenience.',
  },
  {
    code: 'ULG-06',
    name: 'Ulgen Saddle',
    region: 'Ulgen Divide',
    kind: 'weather',
    status: 'online',
    lat: 49.3148,
    lng: 87.6402,
    elevationM: 3120,
    crew: 3,
    blurb:
      'A high-altitude weather post on a saddle above 3,000 m. The thin air makes every chore slower and every cup of tea worse.',
  },
]
