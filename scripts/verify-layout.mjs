/**
 * Stress-tests the symbol placement engine.
 * Packs thousands of cards and asserts that NONE overlap and NONE escape
 * the circular card. Also reports how tightly it packs.
 *
 *   node scripts/verify-layout.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { layoutCard, validateLayout, CARD_RADIUS } from '../src/game/layout.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const deck = JSON.parse(readFileSync(resolve(__dirname, '../src/game/deck.json'), 'utf8'))

const TRIALS = 5000
let failures = 0
let totalDensity = 0
let minGap = Infinity
let rotations = []
let scales = []

const t0 = Date.now()

for (let i = 0; i < TRIALS; i++) {
  const card = deck[i % deck.length]
  const placements = layoutCard(card, i * 2654435761)

  const { valid, errors } = validateLayout(placements)
  if (!valid) {
    failures++
    if (failures <= 5) errors.forEach((e) => console.error(`  trial ${i}: ${e}`))
  }

  if (placements.length !== 8) {
    failures++
    console.error(`  trial ${i}: produced ${placements.length} placements, expected 8`)
  }

  let area = 0
  for (let a = 0; a < placements.length; a++) {
    area += Math.PI * placements[a].r ** 2
    rotations.push(placements[a].rotation)
    scales.push(placements[a].scale)
    for (let b = a + 1; b < placements.length; b++) {
      const d = Math.hypot(placements[a].x - placements[b].x, placements[a].y - placements[b].y)
      minGap = Math.min(minGap, d - placements[a].r - placements[b].r)
    }
  }
  totalDensity += area / (Math.PI * CARD_RADIUS ** 2)
}

const ms = Date.now() - t0
const uniqueRot = new Set(rotations.map((r) => r.toFixed(3))).size

console.log(`trials                      : ${TRIALS} cards (${TRIALS * 8} placements)`)
console.log(`time                        : ${ms}ms  (${(ms / TRIALS).toFixed(3)}ms per card)`)
console.log(`mean fill density           : ${((totalDensity / TRIALS) * 100).toFixed(1)}% of card area`)
console.log(`smallest clearance observed : ${minGap.toFixed(2)}px (must be >= 0)`)
console.log(`distinct rotations          : ${uniqueRot} / ${rotations.length}`)
console.log(`scale range                 : ${Math.min(...scales).toFixed(3)} – ${Math.max(...scales).toFixed(3)}`)
console.log('')
console.log(failures === 0 ? 'PASS — no overlaps, nothing outside the card.' : `FAIL — ${failures} bad layouts.`)
process.exit(failures === 0 ? 0 : 1)
