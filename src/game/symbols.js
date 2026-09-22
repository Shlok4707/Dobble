/**
 * Image Asset Logic — spec section 13.
 *
 * Every image file in src/assets/symbols/ becomes a symbol, in natural
 * filename order. Symbol ids are the index in that sorted list, 0..56.
 *
 * TO USE YOUR OWN ARTWORK:
 *   1. drop your 57 images into src/assets/symbols/
 *   2. delete the placeholder-*.svg files
 * That is the whole job. No code changes, no manifest to maintain, no
 * particular naming scheme required — only that there are 57 of them and
 * that sorting the names gives a stable order.
 */

import { TOTAL_SYMBOLS } from './deckgen.js'

const modules = import.meta.glob('../assets/symbols/*.{png,PNG,jpg,JPG,jpeg,JPEG,webp,WEBP,svg,SVG,gif,GIF,avif,AVIF}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const basename = (p) => p.split('/').pop()

/** Natural sort so img2 comes before img10. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

const files = Object.keys(modules).sort((a, b) => collator.compare(basename(a), basename(b)))

/** Strip extension and leading ordering digits to make a readable label. */
function labelFor(file) {
  return basename(file)
    .replace(/\.[^.]+$/, '')
    .replace(/^placeholder-/, '')
    .replace(/^[\d_-]+/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
}

export const ALL_SYMBOLS = files.map((file, i) => ({
  id: i,
  src: modules[file],
  file: basename(file),
  label: labelFor(file) || `symbol ${i}`,
}))

/** The deck only ever references ids 0..56. */
export const SYMBOLS = ALL_SYMBOLS.slice(0, TOTAL_SYMBOLS)

export const SYMBOL_COUNT = ALL_SYMBOLS.length
export const REQUIRED_SYMBOLS = TOTAL_SYMBOLS

/** Asset Validation at startup — spec section 13. */
export function validateAssets() {
  const errors = []
  if (SYMBOL_COUNT < REQUIRED_SYMBOLS) {
    errors.push(
      `Found ${SYMBOL_COUNT} images in src/assets/symbols/ but the deck needs ${REQUIRED_SYMBOLS}.`
    )
  }
  const names = new Set(ALL_SYMBOLS.map((s) => s.file))
  if (names.size !== ALL_SYMBOLS.length) errors.push('Duplicate filenames in src/assets/symbols/')
  const missingSrc = SYMBOLS.filter((s) => !s.src)
  if (missingSrc.length) errors.push(`${missingSrc.length} symbol(s) resolved to an empty URL`)
  return { valid: errors.length === 0, errors, count: SYMBOL_COUNT }
}

export function getSymbol(id) {
  return SYMBOLS[id]
}

/**
 * Natural aspect ratio (width / height) of a symbol's artwork, filled in by
 * preloadSymbols. Layout uses it to fit each image's real rectangle inside its
 * packed circle. Defaults to 1 until the image has loaded.
 */
export function getAspect(id) {
  return SYMBOLS[id]?.aspect || 1
}

/**
 * Asset Preloading Logic — spec section 20.
 * Resolves once every symbol image is decoded, reporting progress so the
 * loading screen can show "Loaded 32 / 57".
 * A failed image resolves rather than rejects: one bad file should not stop
 * the game from starting (spec section 26, Error Recovery).
 */
export function preloadSymbols(onProgress) {
  let done = 0
  const total = SYMBOLS.length
  const failed = []

  return Promise.all(
    SYMBOLS.map(
      (s) =>
        new Promise((resolve) => {
          const img = new Image()
          const finish = (ok) => {
            done++
            if (!ok) failed.push(s.file)
            onProgress?.(done, total)
            resolve()
          }
          img.onload = () => {
            if (img.naturalWidth && img.naturalHeight) {
              s.aspect = img.naturalWidth / img.naturalHeight
            }
            finish(true)
          }
          img.onerror = () => finish(false)
          img.src = s.src
        })
    )
  ).then(() => ({ total, failed }))
}
