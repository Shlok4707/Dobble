/**
 * Symbol Placement Logic — spec section 2.
 *
 * Turns a list of 8 symbol ids into 8 placements:
 *
 *   { symbolId, x, y, rotation, scale, r }
 *
 * Guarantees, every single time:
 *   - every symbol sits fully INSIDE the circular card  (|c| + r <= R)
 *   - no two symbols touch or overlap                   (d(i,j) >= ri + rj + gap)
 *   - rotation is random per placement                  (0° – 360°)
 *   - scale is random per placement                     (SCALE_MIN – SCALE_MAX)
 *
 * Strategy (spec section 2, "Placement Strategy"):
 *   1. generate random coordinates inside the circle
 *   2. check overlap via euclidean distance
 *   3. if it overlaps, generate a new position; repeat until valid
 *
 * with one production-grade addition: if a full card cannot be packed after
 * MAX_TRIES_PER_SYMBOL darts, every radius shrinks by SHRINK_STEP and the card
 * is re-packed. That makes failure impossible rather than merely unlikely,
 * which matters because a card that fails to pack would stall a round.
 */

import { mulberry32, randRange, shuffle } from './rng.js'

/** Card geometry. The card is a circle of diameter 2*R in abstract units. */
export const CARD_RADIUS = 200 // R  → a 400 x 400 card
export const CARD_DIAMETER = CARD_RADIUS * 2

/** Symbol sizing. `r` is the radius of a symbol's bounding circle. */
const BASE_RADIUS = 52
const SCALE_MIN = 0.78
const SCALE_MAX = 1.15

/* Symbols are packed as circles of radius r; see toCssBox for how the image
 * rectangle is fitted inside that circle. */

/** Breathing room so symbols never visually kiss. */
const GAP = 4 // minimum clear space between two symbols
const EDGE_PAD = 5 // minimum clear space between a symbol and the card rim

const MAX_TRIES_PER_SYMBOL = 600
const MAX_REPACK_ATTEMPTS = 40
const SHRINK_STEP = 0.955

/**
 * @param {number[]} symbolIds  the 8 symbol ids on this card
 * @param {number}   seed       deterministic seed
 * @returns {{symbolId:number,x:number,y:number,rotation:number,scale:number,r:number}[]}
 */
export function layoutCard(symbolIds, seed) {
  const rnd = mulberry32(seed)

  // Draw order is shuffled so the same card never looks the same twice.
  const ids = shuffle(symbolIds, rnd)

  let shrink = 1

  for (let attempt = 0; attempt < MAX_REPACK_ATTEMPTS; attempt++) {
    const placed = []
    let ok = true

    for (let i = 0; i < ids.length; i++) {
      const scale = randRange(rnd, SCALE_MIN, SCALE_MAX)
      const r = BASE_RADIUS * scale * shrink

      // The centre of this symbol must stay within this radius of the card
      // centre, or part of the symbol would poke outside the circle.
      const maxCentre = CARD_RADIUS - r - EDGE_PAD
      if (maxCentre <= 0) {
        ok = false
        break
      }

      let found = null
      for (let t = 0; t < MAX_TRIES_PER_SYMBOL; t++) {
        // Uniform point in a disc: sqrt() keeps it from clustering at the centre.
        const ang = rnd() * Math.PI * 2
        const dist = Math.sqrt(rnd()) * maxCentre
        const x = Math.cos(ang) * dist
        const y = Math.sin(ang) * dist

        let clashes = false
        for (let p = 0; p < placed.length; p++) {
          const o = placed[p]
          const dx = x - o.x
          const dy = y - o.y
          // √((x2-x1)² + (y2-y1)²) — compared squared to skip the sqrt.
          const minD = r + o.r + GAP
          if (dx * dx + dy * dy < minD * minD) {
            clashes = true
            break
          }
        }

        if (!clashes) {
          found = { x, y, r, scale: scale * shrink }
          break
        }
      }

      if (!found) {
        ok = false
        break
      }

      placed.push({
        symbolId: ids[i],
        x: found.x,
        y: found.y,
        r: found.r,
        scale: found.scale,
        rotation: rnd() * 360, // 0° → 360°, random per placement
      })
    }

    if (ok && placed.length === ids.length) return placed

    // Could not pack at this size — make everything slightly smaller and retry.
    shrink *= SHRINK_STEP
  }

  // Unreachable in practice (8 symbols at ~40% area density pack trivially),
  // but a deterministic ring fallback beats throwing mid-round.
  return ringFallback(ids, mulberry32(seed ^ 0x9e3779b9))
}

function ringFallback(ids, rnd) {
  const r = BASE_RADIUS * 0.8
  const ringR = CARD_RADIUS - r - EDGE_PAD - 6
  return ids.map((symbolId, i) => {
    const ang = (i / ids.length) * Math.PI * 2
    return {
      symbolId,
      x: Math.cos(ang) * ringR,
      y: Math.sin(ang) * ringR,
      r,
      scale: 0.8,
      rotation: rnd() * 360,
    }
  })
}

/**
 * Rendering Validation — spec section 15.
 * Confirms a generated layout really is legal. Used by the dev-mode self-check
 * and by scripts/verify-layout.mjs.
 */
export function validateLayout(placements) {
  const errors = []

  for (let i = 0; i < placements.length; i++) {
    const a = placements[i]
    const centreDist = Math.hypot(a.x, a.y)
    if (centreDist + a.r > CARD_RADIUS + 0.001) {
      errors.push(
        `symbol ${a.symbolId} pokes outside the card (|c|=${centreDist.toFixed(1)} + r=${a.r.toFixed(1)} > R=${CARD_RADIUS})`
      )
    }
    for (let j = i + 1; j < placements.length; j++) {
      const b = placements[j]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (d < a.r + b.r - 0.001) {
        errors.push(
          `symbols ${a.symbolId} & ${b.symbolId} overlap (d=${d.toFixed(1)} < ${(a.r + b.r).toFixed(1)})`
        )
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Convert an abstract placement into CSS percentages for absolute rendering.
 *
 * Packing is done on circles, but the thing actually drawn is a RECTANGLE with
 * the image's own aspect ratio. So the box is the largest rectangle of that
 * aspect ratio that fits inside the packed circle — i.e. the one whose diagonal
 * equals the circle's diameter:
 *
 *     w = 2r · a / √(a² + 1)        h = 2r / √(a² + 1)        a = width / height
 *
 * Because the rectangle is inscribed in the circle, and the circles provably
 * never overlap, the visible artwork provably never overlaps either — at any
 * rotation, since rotating about the centre keeps it inside the same circle.
 *
 * Fitting the real aspect ratio (rather than a square, with the image letter-
 * boxed inside it by object-contain) is what lets a tall crewmate or a wide
 * task panel actually fill its circle instead of wasting half of it.
 */
export function toCssBox(p, aspect = 1) {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const k = Math.hypot(a, 1)
  const w = 2 * p.r * (a / k)
  const h = (2 * p.r) / k

  return {
    left: ((p.x + CARD_RADIUS) / CARD_DIAMETER) * 100,
    top: ((p.y + CARD_RADIUS) / CARD_DIAMETER) * 100,
    width: (w / CARD_DIAMETER) * 100,
    height: (h / CARD_DIAMETER) * 100,
  }
}
