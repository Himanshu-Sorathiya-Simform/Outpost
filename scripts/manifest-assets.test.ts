import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The files the manifest points at, checked as bytes: they exist, and each is the size the manifest declares. This lives with the Node tests
 * because it reads images; the rest of the manifest is judged in src/pwa/manifest.test.ts, by the Lab's own checklist.
 */
const ROOT = new URL('../', import.meta.url)
const publicFile = (pathname: string): URL => new URL(`public/${pathname.replace(/^\//, '')}`, ROOT)

interface Image {
  src: string
  sizes: string
  type: string
  form_factor?: string
  label?: string
}
const manifest = JSON.parse(readFileSync(publicFile('manifest.webmanifest'), 'utf8')) as { icons: Image[]; screenshots: Image[]; shortcuts: Image[] }

/** Width and height of a PNG (its IHDR) or a JPEG (its first start-of-frame marker), read from the bytes. */
function imageSize(file: URL): { width: number; height: number } {
  const bytes = readFileSync(file)
  if (bytes.readUInt32BE(0) === 0x89504e47) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  let at = 2
  while (at < bytes.length) {
    const marker = bytes[at + 1] ?? 0
    const length = bytes.readUInt16BE(at + 2)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) }
    at += 2 + length
  }
  throw new Error(`No size found in ${file.pathname}`)
}

describe('the files the manifest points at', () => {
  it('icons exist, are PNGs, and are the size declared', () => {
    for (const icon of manifest.icons) {
      expect(existsSync(publicFile(icon.src)), icon.src).toBe(true)
      const { width, height } = imageSize(publicFile(icon.src))
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes)
      expect(icon.type).toBe('image/png')
    }
  })

  it('shortcut icons exist and are the size declared', () => {
    for (const shortcut of manifest.shortcuts) {
      for (const icon of (shortcut as unknown as { icons: Image[] }).icons) {
        const { width, height } = imageSize(publicFile(icon.src))
        expect(`${width}x${height}`, icon.src).toBe(icon.sizes)
      }
    }
  })

  it('screenshots exist, are JPEGs of exactly the declared size, and the apple-touch-icon is 180 x 180', () => {
    for (const shot of manifest.screenshots) {
      expect(existsSync(publicFile(shot.src)), shot.src).toBe(true)
      const { width, height } = imageSize(publicFile(shot.src))
      expect(`${width}x${height}`, shot.src).toBe(shot.sizes)
      expect(shot.type).toBe('image/jpeg')
    }
    expect(imageSize(publicFile('icons/apple-touch-icon.png'))).toEqual({ width: 180, height: 180 })
  })

  it('has no screenshot file in public/screenshots that the manifest does not list (dead weight in every build)', async () => {
    const { readdirSync } = await import('node:fs')
    const listed = new Set(manifest.screenshots.map((s) => s.src.replace('/screenshots/', '')))
    expect(readdirSync(new URL('public/screenshots/', ROOT)).filter((f) => !listed.has(f))).toEqual([])
  })
})
