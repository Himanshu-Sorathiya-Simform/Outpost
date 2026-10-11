import { describe, expect, it } from 'vitest'
import { OUTBOX_DB, OUTBOX_STORE, SW_BROADCAST_CHANNEL, SYNC_TAG_OUTBOX } from '@shared/sw-protocol'
import * as names from './names'

describe('the outbox names', () => {
  it('equal the contract (they are copied only so the worker bundle needs no zod)', () => {
    expect(names.OUTBOX_DB).toBe(OUTBOX_DB)
    expect(names.OUTBOX_STORE).toBe(OUTBOX_STORE)
    expect(names.SYNC_TAG_OUTBOX).toBe(SYNC_TAG_OUTBOX)
    expect(names.SW_BROADCAST_CHANNEL).toBe(SW_BROADCAST_CHANNEL)
  })
})
