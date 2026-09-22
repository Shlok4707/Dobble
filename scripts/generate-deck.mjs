/**
 * Production Deck Strategy — spec section 1.
 *
 *   Generate → Verify → Save as deck.json → Reuse forever
 *
 * The deck is NEVER regenerated during gameplay. Run this once:
 *   npm run gen:deck
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateDeck, verifyDeck, ORDER, TOTAL_CARDS, TOTAL_SYMBOLS, SYMBOLS_PER_CARD } from '../src/game/deckgen.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outJson = resolve(__dirname, '../src/game/deck.json')
const outJs = resolve(__dirname, '../src/game/deck.js')

console.log(`Generating projective plane of order ${ORDER}...`)
const deck = generateDeck(ORDER)

console.log('Verifying every pair of cards...')
const result = verifyDeck(deck, ORDER)

if (!result.valid) {
  console.error('DECK INVALID — refusing to write deck.json')
  result.errors.slice(0, 20).forEach((e) => console.error('  ' + e))
  process.exit(1)
}

console.log(`  cards            : ${deck.length} (expected ${TOTAL_CARDS})`)
console.log(`  symbols          : ${TOTAL_SYMBOLS}`)
console.log(`  symbols per card : ${SYMBOLS_PER_CARD}`)
console.log(`  pairs checked    : ${result.pairsChecked}`)
console.log('  every pair shares exactly 1 symbol: PASS')

mkdirSync(dirname(outJson), { recursive: true })
writeFileSync(outJson, JSON.stringify(deck), 'utf8')

// Also emitted as a plain ES module so the same file loads identically in Vite
// and in bare Node (importing JSON from Node ESM needs an import attribute
// that bundlers do not all agree on).
const banner = `/**
 * GENERATED FILE — do not edit by hand.
 * Run: npm run gen:deck
 *
 * Finite projective plane of order ${ORDER}.
 *   ${TOTAL_CARDS} cards, ${TOTAL_SYMBOLS} symbols, ${SYMBOLS_PER_CARD} symbols per card.
 *   Verified: all ${result.pairsChecked} card pairs share exactly one symbol.
 *
 * Generated once and reused forever — never regenerated during gameplay.
 */
`
writeFileSync(
  outJs,
  `${banner}const DECK = ${JSON.stringify(deck)}\n\nexport default DECK\n`,
  'utf8'
)

console.log(`\nWrote ${outJson}`)
console.log(`Wrote ${outJs}`)
