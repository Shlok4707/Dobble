/**
 * Seeded pseudo-random number generation + Fisher-Yates shuffle.
 * Spec section 8 (Shuffle Logic).
 *
 * Seeding matters for multiplayer: the host generates a round from a seed and
 * ships the resulting layout to the guest, so both PCs are pixel-identical.
 * Deterministic RNG also makes any layout bug reproducible from its seed.
 */

/** mulberry32 — small, fast, good enough distribution for layout + shuffling. */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0
}

/** Derive a stable child seed so each round/card gets its own stream. */
export function deriveSeed(seed, ...parts) {
  let h = seed >>> 0
  for (const p of parts) {
    h ^= Number(p) >>> 0
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h = (h ^ (h >>> 16)) >>> 0
  }
  return h >>> 0
}

/**
 * Fisher-Yates — O(n), uniform, unbiased.
 * Returns a NEW array; the input is not mutated.
 */
export function shuffle(input, rnd = Math.random) {
  const arr = input.slice()
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

/** Post-shuffle validation — spec section 8. */
export function validateShuffle(original, shuffled) {
  if (original.length !== shuffled.length) return false
  const a = original.slice().sort()
  const b = shuffled.slice().sort()
  return a.every((v, i) => v === b[i])
}

export function randRange(rnd, min, max) {
  return min + rnd() * (max - min)
}

export function randInt(rnd, minInclusive, maxExclusive) {
  return Math.floor(randRange(rnd, minInclusive, maxExclusive))
}
