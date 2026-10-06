import type { HandbookChapter } from '../../shared/contracts'

/**
 * "Outpost Field Station Operating Handbook", in the voice of a mid-1980s issue.
 * The store stamps every chapter with the current edition; content changes only by redeploy.
 */
export const HANDBOOK_CHAPTERS: Omit<HandbookChapter, 'edition'>[] = [
  {
    slug: 'arrival-and-handover',
    number: 1,
    title: 'Arrival and handover',
    summary: 'What the incoming operator checks before the aircraft leaves, and what the outgoing operator owes the ledger.',
    readMinutes: 4,
    blocks: [
      { type: 'h', text: '1.1 Before the aircraft leaves' },
      {
        type: 'p',
        text: 'The aircraft stays on the ground for as long as the pilot is willing to let it, which is never long. Every check in this section is done while it is still there. A fault found ten minutes after departure is yours for the season; a fault found ten minutes before is the outgoing crew\'s, and the aircraft can take a part back.',
      },
      {
        type: 'ul',
        items: [
          'Count the crew against the roster and the bunks against the crew.',
          'Start the heating appliance and leave it burning while you unload.',
          'Read the fuel gauge and dip the day tank by hand. Write down both figures and any difference between them.',
          'Test the main radio on the scheduled channel and answer one call from net control before the pilot is released.',
          'Open the medical chest and look at the seals, not at the list.',
        ],
      },
      {
        type: 'callout',
        tone: 'warn',
        text: 'Do not release the aircraft until the radio has spoken to net control and the heating appliance has been running for ten minutes. A station without either is an emergency already in progress.',
      },
      { type: 'h', text: '1.2 The handover walk' },
      {
        type: 'p',
        text: 'The outgoing operator walks the incoming operator round every instrument, every store and every outbuilding, in daylight if the season has any. The walk takes about three hours and is not shortened by familiarity. Anything said in passing that matters is written in the ledger before the walk moves on, because it will not be remembered by evening.',
      },
      {
        type: 'ul',
        items: [
          'Instruments: where each is, how it is read, and what it has done wrong before.',
          'Stores: fuel, food, spares, medical, and the location of the key to each.',
          'Safe routes: the marked lines, the ones that used to be marked, and the one nobody uses.',
          'Radio: frequencies, the alternate schedule, and any known hum, drift or dead spot.',
          'Hazards: thin ice, loose cable, the step at the back door.',
        ],
      },
      {
        type: 'p',
        text: 'The outgoing operator does not leave until the incoming operator has read back the main points aloud. Reading back takes a quarter of an hour and has prevented more trouble than any other procedure in this book.',
      },
      { type: 'h', text: '1.3 The ledger' },
      {
        type: 'p',
        text: 'The station ledger is a bound book with numbered pages. It is the authority on what happened at the station. Radio messages, computer files and memory are all copies. Entries are made in ink, dated, timed and signed with the operator\'s callsign. Corrections are struck through with a single line so that the original can still be read.',
      },
      {
        type: 'code',
        text: 'Ledger entry format\n\n  <day> <hhmm> <callsign>  <subject>: <text>\n\n14 0615 WREN-6   HANDOVER: fuel dip 388 L, gauge 392 L. Difference noted, not chased.\n14 0640 WREN-6   RADIO: net control answered on 5.4 MHz, S7, clear.',
      },
      {
        type: 'callout',
        tone: 'note',
        text: 'The handover is complete when the incoming operator has signed the ledger under the outgoing operator\'s last entry. Until then the outgoing operator is still responsible, and the station still counts them.',
      },
      { type: 'h', text: '1.4 The first night' },
      {
        type: 'p',
        text: 'Sleep in the main room for the first night. Learn the sounds the building makes and write down which of them change by morning. A new operator who has not yet learned the normal noises will report the wrong ones as faults and sleep through the real ones.',
      },
    ],
  },
  {
    slug: 'daily-observations',
    number: 2,
    title: 'Daily observations',
    summary: 'The times, the order and the format of the observations that are the reason the station exists.',
    readMinutes: 5,
    blocks: [
      { type: 'h', text: '2.1 The schedule' },
      {
        type: 'p',
        text: 'Observations are taken at 0000, 0600, 1200 and 1800 UTC, and read in the same order each time. The order is not arbitrary. It runs from the instruments that change fastest to those that change slowest, so the readings describe the same few minutes as nearly as a person on foot can manage.',
      },
      {
        type: 'ul',
        items: [
          'Wind direction and speed, ten-minute mean and peak gust.',
          'Visibility and present weather.',
          'Cloud amount and base, with the method used to find the base.',
          'Air temperature, wet bulb and dew point.',
          'Station pressure, then pressure reduced to sea level.',
          'Precipitation since the last observation, and snow depth at the reference stake.',
          'Ground and sea state where the station has one.',
        ],
      },
      { type: 'h', text: '2.2 Recording' },
      {
        type: 'p',
        text: 'Each observation is written in the ledger first and in the transmission form second. Never the other way round. The ledger is written with the instrument still in front of you. The form is written at the desk, from the ledger, and any difference between them is a mistake in the form.',
      },
      {
        type: 'code',
        text: 'Observation line\n\n  <hhmm> OBS  T<air> TW<wet> P<hPa> W<dir>/<kn>G<peak> V<km> N<oktas> <weather>\n\n0600 OBS  T-14.2 TW-14.9 P1009.4 W270/08G14 V12 N6 SNOW-\n1200 OBS  T-11.8 TW-12.3 P1007.1 W285/11G19 V6 N8 SNOW',
      },
      { type: 'h', text: '2.3 Instrument faults' },
      {
        type: 'p',
        text: 'An instrument that is wrong is worse than one that is absent, because nobody stops trusting it. When a reading looks doubtful, take it again with a second method and record both. When the two disagree, record both figures, say which you believe and why, and mark the doubtful one suspect. Do not correct a reading in the ledger to match what you think it should have been.',
      },
      {
        type: 'ul',
        items: [
          'Compare the main instrument with the spare or handheld at least once a week.',
          'Record every difference over the stated tolerance in the ledger and in the next transmission.',
          'Tape is not a repair. Record taped instruments as degraded until the part has been fitted.',
        ],
      },
      {
        type: 'callout',
        tone: 'warn',
        text: 'A missed observation is recorded as missed, with the time and the reason. A number entered to fill the gap is a falsified record and will be treated as one.',
      },
      { type: 'h', text: '2.4 Transmission' },
      {
        type: 'p',
        text: 'Observations are transmitted as a group after each round. If the link is down, the group waits in the ledger and goes out with its original times when contact is regained. Chapter 7 describes how.',
      },
      {
        type: 'callout',
        tone: 'note',
        text: 'Late data with the right time is worth more than on-time data with a guessed one. Always send the time of the observation, never the time of the transmission.',
      },
    ],
  },
  {
    slug: 'power-and-fuel',
    number: 3,
    title: 'Power and fuel',
    summary: 'Generators, batteries, load shedding, and how to count fuel when someone else decides the delivery date.',
    readMinutes: 5,
    blocks: [
      { type: 'h', text: '3.1 Principles' },
      {
        type: 'p',
        text: 'The station has three power sources: the main generator, the standby generator and the battery bank, with solar panels where the latitude permits. Any two of them can run the station. The station is not to be run on one for longer than it takes to fix the other. The operator who finds the station on one source reports it the same hour.',
      },
      { type: 'h', text: '3.2 Generators' },
      {
        type: 'ul',
        items: [
          'Start the main generator daily, under load, and record the number of pulls or starts it needed.',
          'A generator that needs more attempts than last week is logged as a fault, however faithfully it runs once started.',
          'Oil and filter every 500 running hours, plugs at 1000, and the fuel filter bowl checked weekly for water.',
          'Never refuel a hot generator. Wait until the exhaust can be touched.',
          'The generator shed is ventilated by design. Do not close the louvres against the weather.',
        ],
      },
      {
        type: 'callout',
        tone: 'warn',
        text: 'Exhaust fumes kill quietly. A carbon monoxide alarm that sounds is obeyed first and investigated second: everyone out, windows open, stove out. Do not reset the alarm to stop the noise.',
      },
      { type: 'h', text: '3.3 Batteries and load shedding' },
      {
        type: 'p',
        text: 'The bank is read at dawn and at dusk. Below 50 percent charge the operator starts shedding load, and does so in the order below. Each step is entered in the ledger with the time and the bank reading, so that a later operator can see what was switched off and when, and what must be switched back on.',
      },
      {
        type: 'ul',
        items: [
          'Hut lighting, except the radio desk and the stove area.',
          'Space heating outside the sleeping room.',
          'Non-essential logging and display units.',
          'Transmitter power reduced to the minimum that holds the scheduled call.',
          'Instruments that can be read by hand, read by hand.',
        ],
      },
      { type: 'h', text: '3.4 Fuel accounting' },
      {
        type: 'p',
        text: 'Fuel is counted in days, not litres. A litre figure is only as good as the burn rate behind it. Work out the daily burn from the last seven days, divide the stock by it, and write the answer beside the stock. Three figures go in the ledger each Monday: stock, burn and days remaining.',
      },
      {
        type: 'code',
        text: 'Fuel line\n\n  <day> <hhmm> FUEL  stock <L>  burn <L/day>  days <n>  reserve line <n>\n\n21 0800 FUEL  stock 388  burn 41  days 9  reserve line 14',
      },
      {
        type: 'p',
        text: 'Below the reserve line, request a delivery. Request it in writing, with the figures, and keep the reference number. Request it a second time, in full, when the first flight is postponed; a postponed flight does not remember the request that was made to it.',
      },
    ],
  },
  {
    slug: 'radio-discipline',
    number: 4,
    title: 'Radio discipline',
    summary: 'Call formats, scheduled contacts, confirmation of receipt, and why a message is not sent until it is acknowledged.',
    readMinutes: 6,
    blocks: [
      { type: 'h', text: '4.1 Why formats exist' },
      {
        type: 'p',
        text: 'Every station shares the same few channels with every other station and with whoever the weather lets in from elsewhere. A fixed format lets the net control operator understand the call in the first four seconds, which is usually all there is before the signal moves. Informal speech is for after the call is answered.',
      },
      { type: 'h', text: '4.2 Scheduled contacts' },
      {
        type: 'p',
        text: 'The scheduled contact is the heartbeat of the network. It is made at the published time whether or not there is traffic to send. A station that has nothing to report says so, and that is a report: it tells net control that the operator is alive, the radio works and the power is holding.',
      },
      {
        type: 'code',
        text: 'Scheduled call\n\n  OUTPOST NET, <STATION> CALLING, SCHEDULED CONTACT, <n> MESSAGES, OVER\n\nOUTPOST NET, KRN-07 CALLING, SCHEDULED CONTACT, TWO MESSAGES, OVER.\nKRN-07, OUTPOST NET, GO AHEAD, OVER.',
      },
      {
        type: 'ul',
        items: [
          'Call at the published time, plus or minus one minute.',
          'Three attempts on the primary channel, then three on the alternate, spaced two minutes apart.',
          'After the last attempt, log the times, the channels and the conditions.',
          'Net control treats two missed contacts as an incident and starts the procedure in Chapter 7.',
        ],
      },
      { type: 'h', text: '4.3 Confirmation' },
      {
        type: 'p',
        text: 'A message has been received when the other station has said so, and not before. Saying it into a microphone is not sending it, and hearing a carrier is not receiving it. Each message carries a number on the sending side. The receiving side reads the number back, and the sender records that read-back against the message.',
      },
      {
        type: 'code',
        text: 'Message and receipt\n\n  MESSAGE <ref>, <station>, <subject>, <text>, OVER\n  RECEIVED <ref>, <receiver>, OUT\n\nMESSAGE 0412, GLM-12, FUEL, STOCK TWO TWO DAYS, NEXT FLIGHT REQUESTED, OVER.\nRECEIVED 0412, OUTPOST NET, OUT.',
      },
      {
        type: 'callout',
        tone: 'warn',
        text: 'A message without a receipt is an unsent message. If the receipt does not come, send it again with the same number, not a new one. The receiving station can tell a repeat from a new message by the number, and a second copy does no harm.',
      },
      { type: 'h', text: '4.4 Plain speech' },
      {
        type: 'ul',
        items: [
          'Numbers digit by digit: "four one two", not "four hundred twelve".',
          'Times in UTC, four digits, with no colon.',
          'No abbreviations that the other end has to guess. If it is not in the table, say it in full.',
          'Do not use the net for conversation. Use it for traffic and for confirming you are still there.',
        ],
      },
      {
        type: 'callout',
        tone: 'note',
        text: 'Repeat rather than rephrase. A message said a second time in the same words is either understood or it is not. A message rephrased is a new message that may not match the first.',
      },
    ],
  },
  {
    slug: 'weather-holds-and-safe-movement',
    number: 5,
    title: 'Weather holds and safe movement',
    summary: 'When to stay inside, how to move outside, and how rope lines, tethers and a second person keep a round from becoming a search.',
    readMinutes: 5,
    blocks: [
      { type: 'h', text: '5.1 The hold' },
      {
        type: 'p',
        text: 'A weather hold is declared by the operator in charge, not by the weather. It takes effect when any of the limits below is reached or forecast within the next three hours. During a hold, movement outside is limited to the marked lines and the tasks that cannot wait, and each is done in pairs.',
      },
      {
        type: 'ul',
        items: [
          'Wind above 20 m/s at the hut, or gusts above 25 m/s.',
          'Visibility below 50 m.',
          'Air temperature below -35 C with any wind above 5 m/s.',
          'Drifting snow at the door deeper than half its height.',
        ],
      },
      { type: 'h', text: '5.2 Marked lines' },
      {
        type: 'p',
        text: 'Every regular route from the hut to an instrument is a rope line, with a stake every 10 m and a cord to a fixed point at each end. A round is made on the line, hand on the cord, not beside it. A round made off the line in good weather is poor practice; in poor weather it is the start of a search.',
      },
      {
        type: 'callout',
        tone: 'warn',
        text: 'Nobody walks outside during a hold without telling someone inside where they are going, how long they expect to take and when that someone should start to worry. Write the time on the board by the door.',
      },
      { type: 'h', text: '5.3 The door board' },
      {
        type: 'code',
        text: 'Door board\n\nNAME      OUT    DEST            BACK BY   BACK\nTEAGUE-3  1605   SNOW PILLOW     1625      ____\nHALLORAN  ----   ON THE CORD     ----      ----',
      },
      {
        type: 'p',
        text: 'A person is overdue when five minutes have passed after the time on the board. The person inside does not wait for ten. The first response is to go to the end of the cord, tethered, and call. The second is to start the generator, if it is not already running, so that it can be heard.',
      },
      { type: 'h', text: '5.4 If someone is overdue' },
      {
        type: 'ul',
        items: [
          'Note the time and start the clock.',
          'Go out on the cord, tethered, and call. Do not leave it.',
          'Switch on every exterior lamp and leave the generator running as a sound marker.',
          'Report overdue at 15 minutes, by radio, to net control, with the last known position.',
          'At 30 minutes, ask for assistance. Do not wait to be sure.',
        ],
      },
      {
        type: 'callout',
        tone: 'note',
        text: 'An overdue report that turns out to be nothing costs a cup of tea. An overdue report that is held back costs more than that. The form of report is the same either way.',
      },
    ],
  },
  {
    slug: 'medical-and-welfare',
    number: 6,
    title: 'Medical and welfare',
    summary: 'The chest, the log, radio consultation, and the quieter work of keeping a small crew in working order.',
    readMinutes: 4,
    blocks: [
      { type: 'h', text: '6.1 The chest' },
      {
        type: 'p',
        text: 'The medical chest is checked on arrival and on the first of each month. The check covers the seals, the dates, the quantities and the condition of the thermometer, which has been dropped at every station in the network at least once. Missing items are requested on the next supply request and are not borrowed from other stations without a written note.',
      },
      { type: 'h', text: '6.2 Recording illness and injury' },
      {
        type: 'p',
        text: 'Every treatment, however minor, goes in the medical log with the time, the patient, the complaint, what was done and the readings taken. The readings are taken before the treatment. This is the one place in the handbook where a doctor three thousand kilometres away will depend on your handwriting.',
      },
      {
        type: 'code',
        text: 'Medical log\n\n<day> <hhmm> <patient> COMPLAINT: <text>\n             PULSE <n> RESP <n> TEMP <C> PAIN <0-10>\n             ACTION: <text>\n\n11 1530 BRINDLE  COMPLAINT: fall, left lower ribs, pain on deep breath\n                 PULSE 88 RESP 18 TEMP 36.4 PAIN 6\n                 ACTION: warmed, dry clothes, radio consultation requested',
      },
      { type: 'h', text: '6.3 Radio consultation' },
      {
        type: 'ul',
        items: [
          'State the patient, the complaint and the time it began.',
          'Give pulse, respiration, temperature and the location of any pain, in that order.',
          'State what has already been done and what is available to do next.',
          'Read the advice back and log it before the call ends.',
        ],
      },
      { type: 'h', text: '6.4 Cold injury' },
      {
        type: 'p',
        text: 'Frostnip is white and painless and passes with warmth. Frostbite is hard, waxy and does not. Re-warm in water at 38 to 40 C and keep the patient still. Do not rub. Do not re-warm if refreezing is possible before the patient reaches shelter; a thawed and refrozen limb is a worse injury than a frozen one.',
      },
      { type: 'h', text: '6.5 Welfare' },
      {
        type: 'p',
        text: 'Small crews fail in small ways first. A missed meal, an unanswered question and a chair left empty are early signs that are easy to excuse and expensive to ignore. The operator in charge holds a short talk with each crew member every week, about the work and not about anything else, and writes down only that it took place.',
      },
      {
        type: 'callout',
        tone: 'warn',
        text: 'Any crew member may ask for a relief flight without giving a reason. The request goes to net control as written, and it is not discussed on the net. A reason can be given later or never.',
      },
    ],
  },
  {
    slug: 'loss-of-contact-procedures',
    number: 7,
    title: 'Loss of contact procedures',
    summary: 'How to keep working when the link is down, what to keep, what to batch, and how to replay it in order when contact returns.',
    readMinutes: 7,
    blocks: [
      { type: 'h', text: '7.1 The principle' },
      {
        type: 'p',
        text: 'The link will fail. Atmospheric absorption, a fallen mast, a flat battery and a cracked connector are each enough, and all four have happened in the same season. Loss of contact does not stop the station. The observations are taken, the ledger is kept and the routine continues. The only thing that stops is delivery, and delivery is resumed later. Work as though the link were always about to fail, not as though it had. A station with a complete ledger at every moment loses nothing when the radio goes quiet.',
      },
      { type: 'h', text: '7.2 Keep the written log' },
      {
        type: 'p',
        text: 'The written log is the station\'s memory while the link is down. Everything that would have been transmitted is written instead, in full, with its own reference number and the time it was composed. A message written at 0640 is marked 0640, however late it is sent. Numbers run in sequence without gaps. A gap in the numbers later tells the receiver that something is missing.',
      },
      {
        type: 'code',
        text: 'Held message\n\n  HELD <ref> <composed hhmm> <station> <subject>: <text>   [status]\n\nHELD 0412 0640 GLM-12 FUEL: stock 22 days, next flight requested   [queued]\nHELD 0413 0702 GLM-12 OBS: 0600 group                                [queued]\nHELD 0414 0715 GLM-12 SUPPLY: flight confirmed for Wednesday         [queued]',
      },
      { type: 'h', text: '7.3 What to batch: three piles before the first call' },
      {
        type: 'ul',
        items: [
          'First: anything touching safety, injury, power or the state of the link itself.',
          'Second: observations and scheduled reports, which go out in a single group in time order.',
          'Third: supply, stores and housekeeping, which are batched into one message where they can be.',
        ],
      },
      { type: 'h', text: '7.4 Replay in order' },
      {
        type: 'p',
        text: 'Within each pile, messages go in the order they were composed. A later message that depends on an earlier one is useless if it arrives first. A fuel request that follows a fuel correction, for instance, must not be read before the correction. The receiver is told at the start of the replay how many messages follow and the lowest and highest reference numbers, so that the receiver can check the count as it goes.',
      },
      {
        type: 'code',
        text: 'Replay opening\n\n  OUTPOST NET, <STATION> CALLING, HELD TRAFFIC, <n> MESSAGES, <first> TO <last>, OVER\n\nOUTPOST NET, GLM-12 CALLING, HELD TRAFFIC, THREE MESSAGES, 0412 TO 0414, OVER.\nGLM-12, OUTPOST NET, GO AHEAD, OVER.',
      },
      { type: 'h', text: '7.5 Never assume the last message was received; confirm with a reference number' },
      {
        type: 'p',
        text: 'The last message sent before a failure is the one most likely to have been lost. It was being sent while the signal was going. The operator does not assume that it arrived because nothing came back to say it had not. The first held message on resumption is always a repeat of the last one sent, with its original number.',
      },
      {
        type: 'callout',
        tone: 'warn',
        text: 'Silence is not a receipt. A message is delivered when a reference number has been read back to you by the receiving station. Until then it stays in the held log, marked queued, however long ago it was sent.',
      },
      {
        type: 'p',
        text: 'Each message in the replay is confirmed individually. The operator marks it done in the held log only when the receipt has been heard. A receipt that is garbled is treated as no receipt and the message is repeated. A repeat is harmless: the receiver sees the same number and discards the copy.',
      },
      {
        type: 'code',
        text: 'Held log after replay\n\nHELD 0412 0640 GLM-12 FUEL: stock 22 days, next flight requested   [confirmed 0931]\nHELD 0413 0702 GLM-12 OBS: 0600 group                                [confirmed 0931]\nHELD 0414 0715 GLM-12 SUPPLY: flight confirmed for Wednesday         [repeat, confirmed 0934]',
      },
      {
        type: 'p',
        text: 'Net control works to the same rule from the other end. One missed scheduled contact is noted. Two are an incident. Net control tries the alternate channel, the neighbouring stations and the regional liaison in that order, and notes the reference number of each. A station that comes back on the air after an incident opens with its own reference number, closes the incident by number and reports what happened. The explanation comes after the closure, not before it.',
      },
    ],
  },
  {
    slug: 'closing-the-season',
    number: 8,
    title: 'Closing the season',
    summary: 'What is shut down, what is left running, and what is written down before the last aircraft takes you home.',
    readMinutes: 4,
    blocks: [
      { type: 'h', text: '8.1 The shape of the closing' },
      {
        type: 'p',
        text: 'Closing starts three weeks before the last flight and finishes the morning it arrives. It is done in the same order every year, so that any step missed can be found from the list instead of from the first frost. The operator in charge holds the list and initials each line as it is done.',
      },
      { type: 'h', text: '8.2 Order of work' },
      {
        type: 'ul',
        items: [
          'Week 3: inventory of every spare, every tool and every unopened tin. Mark what must be removed and what stays.',
          'Week 2: instruments serviced, recalibrated and labelled with the date. Comparison readings against the spares logged.',
          'Week 1: fuel drained from everything that will freeze, the rest topped to the neck. Batteries charged and isolated.',
          'Final week: ledger closed, radio schedules reduced to the winter timetable, and the heating appliance damped to its winter setting.',
        ],
      },
      { type: 'h', text: '8.3 Leaving the station safe' },
      {
        type: 'p',
        text: 'A closed station is visited by nobody for months, and what is left in it is left to the weather and to whatever animals are curious. Food stores are sealed in metal, not cardboard. Bedding is lifted off the floor. Every door is closed and every window is shuttered. The emergency store is stocked and dated and the key is on the hook where the next crew will look for it first.',
      },
      {
        type: 'callout',
        tone: 'warn',
        text: 'Nothing flammable is left in the generator shed and nothing perishable is left anywhere. The last aircraft will not wait while you go back for a box.',
      },
      { type: 'h', text: '8.4 The closing entry' },
      {
        type: 'p',
        text: 'The last page of the ledger carries the closing entry. It gives the state of each instrument, the stock of each store, the faults that are still open and the faults that were closed, and a short note to the next operator on anything that cannot be found in a list. Every open fault is numbered, dated and signed.',
      },
      {
        type: 'code',
        text: 'Closing entry\n\n<day> <hhmm> <callsign>  CLOSING: <state of station>\n  OPEN 1: <fault, date first logged, action proposed>\n  OPEN 2: ...\n  STORES: fuel <L>  food <days>  medical sealed <y/n>\n  NOTE: <the thing that is not in a list>\n\n30 0840 DUNLIN-1  CLOSING: instruments serviced, bank isolated, radio to winter schedule.\n  OPEN 1: hygrometer element drifts above 70 percent RH, logged 12th, replace in spring.\n  STORES: fuel 210  food 38  medical sealed y\n  NOTE: fifth key is on the hook in the generator shed.',
      },
      {
        type: 'callout',
        tone: 'note',
        text: 'Read the previous closing entry again before writing this one. Whatever you were told at arrival that turned out to be true is worth repeating to the person who comes next.',
      },
    ],
  },
]
