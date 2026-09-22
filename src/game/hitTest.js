/**
 * Alpha-channel hit testing.
 *
 * The spec is emphatic that ONLY the actual object may register a click:
 *   - the card background must NOT be clickable
 *   - empty areas inside the cards must NOT be clickable
 *   - no accidental click outside an image should count as an answer
 *
 * CSS alone can only give us a rectangular hit box, so a click in the
 * transparent corner of a symbol's PNG would still count. This module samples
 * the image's alpha channel at the exact click point and rejects the click if
 * that pixel is transparent.
 *
 * Images are bundled by Vite and served same-origin, so the canvas is never
 * tainted and getImageData works. If it ever does fail, we fall back to
 * accepting the click rather than making a symbol unclickable.
 */

const SAMPLE = 96 // alpha mask resolution per symbol
const ALPHA_THRESHOLD = 24 // 0-255; below this counts as "not the object"

/** src -> Uint8ClampedArray alpha mask, or null while loading / on failure */
const masks = new Map()
const pending = new Map()

function buildMask(src) {
  if (masks.has(src)) return Promise.resolve(masks.get(src))
  if (pending.has(src)) return pending.get(src)

  const job = new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = SAMPLE
        canvas.height = SAMPLE
        const ctx = canvas.getContext('2d', { willReadFrequently: true })

        // Mirror `object-fit: contain` so mask coordinates line up with what
        // the user actually sees.
        const ratio = Math.min(SAMPLE / img.naturalWidth, SAMPLE / img.naturalHeight)
        const w = img.naturalWidth * ratio
        const h = img.naturalHeight * ratio
        ctx.drawImage(img, (SAMPLE - w) / 2, (SAMPLE - h) / 2, w, h)

        const data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data
        const alpha = new Uint8ClampedArray(SAMPLE * SAMPLE)
        for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]

        masks.set(src, alpha)
        resolve(alpha)
      } catch {
        masks.set(src, null) // tainted or unsupported — fall back to box hits
        resolve(null)
      } finally {
        pending.delete(src)
      }
    }
    img.onerror = () => {
      masks.set(src, null)
      pending.delete(src)
      resolve(null)
    }
    img.src = src
  })

  pending.set(src, job)
  return job
}

/** Warm the cache so the first click of a round is never a box-hit fallback. */
export function primeMasks(srcs) {
  return Promise.all(srcs.map(buildMask))
}

/**
 * @param {string} src image url
 * @param {number} u horizontal position within the image box, 0..1
 * @param {number} v vertical position within the image box, 0..1
 * @returns {boolean} true if the click landed on actual artwork
 */
export function isOpaqueAt(src, u, v) {
  const mask = masks.get(src)
  if (mask === undefined) {
    buildMask(src) // not ready yet — accept this click, be exact from now on
    return true
  }
  if (mask === null) return true // could not build a mask — accept

  if (u < 0 || u > 1 || v < 0 || v > 1) return false

  const px = Math.min(SAMPLE - 1, Math.max(0, Math.floor(u * SAMPLE)))
  const py = Math.min(SAMPLE - 1, Math.max(0, Math.floor(v * SAMPLE)))

  // Sample a small neighbourhood so thin artwork (antennae, thin outlines)
  // stays comfortably clickable without making empty space clickable.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = px + dx
      const y = py + dy
      if (x < 0 || y < 0 || x >= SAMPLE || y >= SAMPLE) continue
      if (mask[y * SAMPLE + x] > ALPHA_THRESHOLD) return true
    }
  }
  return false
}
