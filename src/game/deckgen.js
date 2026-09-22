/**
 * Deck Generation Logic  —  Spec section 1.
 *
 * Builds a finite projective plane of order n.
 *
 *   Symbols       = n² + n + 1
 *   Cards         = n² + n + 1
 *   Symbols/Card  = n + 1
 *
 * With n = 7:  57 symbols, 57 cards, 8 symbols per card.
 *
 * The defining property: ANY two cards share EXACTLY ONE symbol.
 * Never zero. Never two. That is what guarantees every round has
 * exactly one valid answer.
 *
 * This module is pure and has no browser dependencies, so it is shared
 * by the app and by scripts/generate-deck.mjs + scripts/verify-deck.mjs.
 */

export const ORDER = 7
export const SYMBOLS_PER_CARD = ORDER + 1 // 8
export const TOTAL_SYMBOLS = ORDER * ORDER + ORDER + 1 // 57
export const TOTAL_CARDS = TOTAL_SYMBOLS // 57

/**
 * @param {number} n order of the projective plane (must be prime: 2,3,5,7,11...)
 * @returns {number[][]} array of cards, each an array of n+1 symbol ids
 */
export function generateDeck(n = ORDER) {
  const cards = []

  // --- Step 1: the very first card --------------------------------------
  // [0, 1, 2, ... n]   →   n = 7 gives [0..7]
  const first = []
  for (let i = 0; i <= n; i++) first.push(i)
  cards.push(first)

  // --- Step 2: n cards that all pass through symbol 0 --------------------
  // [0] + [ (n+1) + n*j + k ]
  for (let j = 0; j < n; j++) {
    const card = [0]
    for (let k = 0; k < n; k++) {
      card.push(n + 1 + n * j + k)
    }
    cards.push(card)
  }

  // --- Step 3: the remaining n² cards -----------------------------------
  // [i+1] + [ (n+1) + n*k + ((i*k + j) mod n) ]
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const card = [i + 1]
      for (let k = 0; k < n; k++) {
        card.push(n + 1 + n * k + ((i * k + j) % n))
      }
      cards.push(card)
    }
  }

  return cards
}

/**
 * Verification Rules — spec section 1.
 * Checks every unordered pair of cards for an intersection of exactly 1.
 *
 * @returns {{valid: boolean, errors: string[], pairsChecked: number}}
 */
export function verifyDeck(deck, n = ORDER) {
  const errors = []
  const expectedCards = n * n + n + 1
  const expectedPerCard = n + 1
  const expectedSymbols = expectedCards

  if (deck.length !== expectedCards) {
    errors.push(`Expected ${expectedCards} cards, got ${deck.length}`)
  }

  const seenSymbols = new Set()
  deck.forEach((card, idx) => {
    if (card.length !== expectedPerCard) {
      errors.push(`Card ${idx} has ${card.length} symbols, expected ${expectedPerCard}`)
    }
    if (new Set(card).size !== card.length) {
      errors.push(`Card ${idx} contains a duplicate symbol`)
    }
    card.forEach((s) => {
      seenSymbols.add(s)
      if (s < 0 || s >= expectedSymbols) {
        errors.push(`Card ${idx} references out-of-range symbol ${s}`)
      }
    })
  })

  if (seenSymbols.size !== expectedSymbols) {
    errors.push(`Deck uses ${seenSymbols.size} distinct symbols, expected ${expectedSymbols}`)
  }

  // The important test: every pair shares exactly one symbol.
  let pairsChecked = 0
  const sets = deck.map((c) => new Set(c))
  for (let a = 0; a < deck.length; a++) {
    for (let b = a + 1; b < deck.length; b++) {
      let shared = 0
      for (const s of deck[a]) if (sets[b].has(s)) shared++
      pairsChecked++
      if (shared !== 1) {
        errors.push(`Cards ${a} & ${b} share ${shared} symbols (expected exactly 1)`)
        if (errors.length > 20) {
          return { valid: false, errors, pairsChecked }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, pairsChecked }
}

/**
 * The one symbol two cards have in common.
 * Returns -1 if the deck is somehow invalid (should never happen).
 */
export function commonSymbol(cardA, cardB) {
  const setB = new Set(cardB)
  for (const s of cardA) if (setB.has(s)) return s
  return -1
}
