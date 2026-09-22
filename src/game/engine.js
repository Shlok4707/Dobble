/**
 * The authoritative game engine. Pure functions only — no React, no network.
 *
 * Only the HOST runs this. The guest never calls into it; it renders the
 * snapshots the host sends. Keeping it pure means the whole rule set can be
 * unit-tested headlessly (see scripts/simulate-game.mjs).
 */

import DECK from './deck.js'
import { commonSymbol } from './deckgen.js'
import { layoutCard } from './layout.js'
import { mulberry32, shuffle, deriveSeed, randomSeed } from './rng.js'
import { PHASE, ROLE } from './protocol.js'

export const TOTAL_ROUNDS = 9

/** Ignore a repeat click on the same symbol inside this window. */
export const DOUBLE_CLICK_MS = 500
/** Hard ceiling on click rate per player. */
export const CLICK_COOLDOWN_MS = 220

export const REJECT = {
  NOT_PLAYING: 'NOT_PLAYING',
  STALE_ROUND: 'STALE_ROUND',
  ROUND_ALREADY_WON: 'ROUND_ALREADY_WON',
  SYMBOL_NOT_ON_CARDS: 'SYMBOL_NOT_ON_CARDS',
  DUPLICATE: 'DUPLICATE',
  COOLDOWN: 'COOLDOWN',
}

/**
 * Pick 9 pairs of cards for a game.
 *
 * Every pair of Dobble cards shares exactly one symbol by construction, so any
 * two distinct cards form a valid round. Drawing 18 distinct cards from a
 * shuffled deck means no card is ever seen twice in one game.
 */
export function buildRounds(seed, totalRounds = TOTAL_ROUNDS) {
  const rnd = mulberry32(seed)
  const order = shuffle(
    DECK.map((_, i) => i),
    rnd
  )

  const rounds = []
  for (let r = 0; r < totalRounds; r++) {
    const idxA = order[r * 2]
    const idxB = order[r * 2 + 1]
    const cardA = DECK[idxA]
    const cardB = DECK[idxB]
    const matchId = commonSymbol(cardA, cardB)

    if (matchId < 0) {
      // Structurally impossible with a verified deck, but never ship a round
      // that has no answer.
      throw new Error(`Cards ${idxA} and ${idxB} share no symbol — deck is corrupt`)
    }

    rounds.push({
      index: r,
      cardIndexA: idxA,
      cardIndexB: idxB,
      matchId,
      layoutA: layoutCard(cardA, deriveSeed(seed, r, 1)),
      layoutB: layoutCard(cardB, deriveSeed(seed, r, 2)),
    })
  }
  return rounds
}

export function createGame(seed = randomSeed(), totalRounds = TOTAL_ROUNDS) {
  return {
    seed,
    phase: PHASE.LOBBY,
    totalRounds,
    rounds: buildRounds(seed, totalRounds),
    round: 0,
    roundWinner: null,
    revealMatch: false,
    scores: { [ROLE.HOST]: 0, [ROLE.GUEST]: 0 },
    /** role -> { lastClickAt, lastSymbolId, lastSymbolAt } */
    clickGuards: {
      [ROLE.HOST]: { lastClickAt: 0, lastSymbolId: null, lastSymbolAt: 0 },
      [ROLE.GUEST]: { lastClickAt: 0, lastSymbolId: null, lastSymbolAt: 0 },
    },
  }
}

export function currentRound(game) {
  return game.rounds[game.round]
}

/**
 * The snapshot sent to the guest.
 *
 * `matchId` is included ONLY once the round is over. While a round is live the
 * guest genuinely does not have the answer.
 */
export function snapshotFor(game) {
  const r = currentRound(game)
  return {
    phase: game.phase,
    round: game.round,
    totalRounds: game.totalRounds,
    scores: { ...game.scores },
    roundWinner: game.roundWinner,
    layoutA: r ? r.layoutA : [],
    layoutB: r ? r.layoutB : [],
    matchId: game.revealMatch && r ? r.matchId : null,
  }
}

/**
 * Validation Logic — spec section 10 — plus the round rules from the game flow.
 *
 * Returns { accepted, correct, reason, game }.
 * `game` is a NEW object when anything changed, the same object otherwise.
 */
/**
 * Validate a click WITHOUT changing anything.
 *
 * This exists because a correct click cannot be acted on the instant it
 * arrives any more. The host now holds a short arbitration window and awards
 * the round to the earliest *timestamp* rather than the earliest arrival, so
 * that a player on a slower connection is not punished for it. During that
 * window the host still needs to know whether each incoming click is legal
 * and whether it is the answer — but must not commit to it yet.
 *
 * @returns {{accepted: boolean, correct: boolean, reason: string|null}}
 */
export function inspectClick(game, role, symbolId, round, now = Date.now()) {
  const no = (reason) => ({ accepted: false, correct: false, reason })

  // "Further clicks from either player for that round must not award points."
  // Checked before the phase test so that the very common case — the loser's
  // click arriving a few milliseconds late — reports the accurate reason
  // rather than the generic one.
  if (game.roundWinner !== null) return no(REJECT.ROUND_ALREADY_WON)

  // State machine: clicks only count while a round is actually live.
  if (game.phase !== PHASE.PLAYING) return no(REJECT.NOT_PLAYING)

  // A click from a round that has already moved on is discarded, which is what
  // stops a laggy client scoring in the wrong round.
  if (round !== game.round) return no(REJECT.STALE_ROUND)

  const guard = game.clickGuards[role]
  if (!guard) return no(REJECT.NOT_PLAYING)

  // Spam prevention — spec section 21.
  if (now - guard.lastClickAt < CLICK_COOLDOWN_MS) return no(REJECT.COOLDOWN)

  // Double-click prevention — spec section 3, "Ignore duplicates".
  if (guard.lastSymbolId === symbolId && now - guard.lastSymbolAt < DOUBLE_CLICK_MS) {
    return no(REJECT.DUPLICATE)
  }

  const r = currentRound(game)
  const onCards =
    r.layoutA.some((p) => p.symbolId === symbolId) || r.layoutB.some((p) => p.symbolId === symbolId)

  // Invalid symbol — a symbol that isn't on either card is rejected outright.
  if (!onCards) return no(REJECT.SYMBOL_NOT_ON_CARDS)

  return { accepted: true, correct: symbolId === r.matchId, reason: null }
}

export function submitClick(game, role, symbolId, round, now = Date.now()) {
  const verdict = inspectClick(game, role, symbolId, round, now)
  if (!verdict.accepted) {
    return { accepted: false, correct: false, reason: verdict.reason, game }
  }

  const nextGuards = {
    ...game.clickGuards,
    [role]: { lastClickAt: now, lastSymbolId: symbolId, lastSymbolAt: now },
  }

  const correct = verdict.correct

  if (!correct) {
    // Incorrect clicks do not award points and do not deduct any — the game
    // flow specifies a plain +1-per-round score out of 9.
    return { accepted: true, correct: false, reason: null, game: { ...game, clickGuards: nextGuards } }
  }

  // First correct click wins the round.
  return {
    accepted: true,
    correct: true,
    reason: null,
    game: {
      ...game,
      clickGuards: nextGuards,
      roundWinner: role,
      revealMatch: true,
      phase: PHASE.ROUND_END,
      scores: { ...game.scores, [role]: game.scores[role] + 1 },
    },
  }
}

/** Move to the next round, or end the game if all rounds are done. */
export function advanceRound(game) {
  const next = game.round + 1
  if (next >= game.totalRounds) {
    return { ...game, phase: PHASE.GAME_OVER, roundWinner: null, revealMatch: false }
  }
  return {
    ...game,
    round: next,
    phase: PHASE.PLAYING,
    roundWinner: null,
    revealMatch: false,
  }
}

export const RESULT = { WIN: 'WIN', LOSE: 'LOSE', DRAW: 'DRAW' }

/** End Game Logic — spec section 12. Result from one player's point of view. */
export function resultFor(scores, role) {
  const mine = scores[role]
  const theirs = scores[role === ROLE.HOST ? ROLE.GUEST : ROLE.HOST]
  if (mine > theirs) return RESULT.WIN
  if (mine < theirs) return RESULT.LOSE
  return RESULT.DRAW
}
