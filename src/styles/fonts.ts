/**
 * Self-hosted variable fonts (the app must work offline, so nothing comes from a CDN).
 * Each stylesheet declares latin, latin-ext and vietnamese faces with unicode-range, so the
 * browser only downloads the latin file unless a glyph outside it is actually rendered.
 *
 *  - Big Shoulders Display: wght axis, used for titles and numerals
 *  - Newsreader: opsz + wght axes (roman and italic), used for reading text
 *  - Spline Sans Mono: wght axis, used for labels, tables, controls
 */
import '@fontsource-variable/big-shoulders-display/wght'
import '@fontsource-variable/newsreader/opsz'
import '@fontsource-variable/newsreader/opsz-italic'
import '@fontsource-variable/spline-sans-mono/wght'
