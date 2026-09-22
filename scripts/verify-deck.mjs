/**
 * Deck Validation Testing — spec section 18 ("Most important test").
 * Verifies the stored deck.json, not a freshly generated one, so that what
 * ships is what is tested.
 *
 *   npm run test:deck
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyDeck, ORDER, TOTAL_CARDS, SYMBOLS_PER_CARD } from '../src/game/deckgen.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const deckPath = resolve(__dirname, '../src/game/deck.json')

let deck
try {
  deck = JSON.parse(readFileSync(deckPath, 'utf8'))
} catch (err) {
  console.error(`Could not read ${deckPath}. Run: npm run gen:deck`)
  process.exit(1)
}

const result = verifyDeck(deck, ORDER)

const checks = [
  ['deck.json parsed', Array.isArray(deck)],
  [`card count === ${TOTAL_CARDS}`, deck.length === TOTAL_CARDS],
  [`every card has ${SYMBOLS_PER_CARD} symbols`, deck.every((c) => c.length === SYMBOLS_PER_CARD)],
  ['no duplicate symbols within a card', deck.every((c) => new Set(c).size === c.length)],
  [`every one of the ${result.pairsChecked} card pairs shares exactly 1 symbol`, result.valid],
]

let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failed++
}

if (!result.valid) {
  result.errors.slice(0, 10).forEach((e) => console.error('      ' + e))
}

console.log(failed === 0 ? '\nAll deck tests passed.' : `\n${failed} check(s) failed.`)
process.exit(failed === 0 ? 0 : 1)
