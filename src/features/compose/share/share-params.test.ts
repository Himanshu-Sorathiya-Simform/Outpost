import { describe, expect, it } from 'vitest'
import { preview, readShare } from './share-params'

const read = (init: Record<string, string>) => readShare(new URLSearchParams(init))

describe('readShare', () => {
  it('reads title, text and url', () => {
    expect(read({ title: 'T', text: 'Body', url: 'https://example.org/a' })).toMatchObject({
      title: 'T',
      text: 'Body',
      url: 'https://example.org/a',
      urlInText: null,
      received: true,
    })
  })
  it('finds a link inside the text when url is empty, and leaves the text alone', () => {
    const s = read({ text: 'Look at this https://example.org/wx.' })
    expect(s.url).toBeNull()
    expect(s.urlInText).toBe('https://example.org/wx')
    expect(s.text).toBe('Look at this https://example.org/wx.')
  })
  it('drops a url that is not http(s)', () => {
    expect(read({ url: 'javascript:alert(1)' })).toMatchObject({ url: null, urlRejected: true, received: true })
  })
  it('knows when nothing was shared', () => {
    expect(read({}).received).toBe(false)
    expect(read({ title: '  ' }).received).toBe(false)
  })
  it('counts what does not fit a dispatch instead of hiding it', () => {
    const s = read({ title: 'x'.repeat(400), text: 'y'.repeat(6000) })
    expect(s.title).toHaveLength(120)
    expect(s.text).toHaveLength(4000)
    expect(s.dropped).toEqual({ title: 280, body: 2000 })
    expect(read({ title: 'short', text: 'short' }).dropped).toEqual({ title: 0, body: 0 })
  })
  it('strips control characters', () => {
    expect(read({ title: 'a\u0000‮b' }).title).toBe('ab')
  })
})

describe('preview', () => {
  it('reports how much was cut', () => {
    expect(preview('short', 10)).toEqual({ shown: 'short', cut: 0 })
    expect(preview('x'.repeat(20), 10)).toEqual({ shown: `${'x'.repeat(10)}…`, cut: 10 })
  })
})
