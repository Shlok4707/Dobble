/**
 * Headless rule tests for the authoritative engine — spec section 18.
 * Exercises every rule the game flow demands, without a browser or a network.
 *
 *   node scripts/simulate-game.mjs
 */
import { createRequire } from 'node:module'
import {
  REJECT,
  RESULT,
  TOTAL_ROUNDS,
  advanceRound,
  buildRounds,
  createGame,
  currentRound,
  resultFor,
  snapshotFor,
  submitClick,
} from '../src/game/engine.js'
import { PHASE, ROLE } from '../src/game/protocol.js'
import { validateLayout } from '../src/game/layout.js'

const require = createRequire(import.meta.url)

let pass = 0
let fail = 0
function check(name, condition, detail = '') {
  if (condition) {
    pass++
    console.log(`PASS  ${name}`)
  } else {
    fail++
    console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`)
  }
}

const play = (game) => ({ ...game, phase: PHASE.PLAYING })

// ---------------------------------------------------------------------------
console.log('\n— round construction —')
{
  const rounds = buildRounds(12345)
  check('builds exactly 9 rounds', rounds.length === TOTAL_ROUNDS)
  check(
    'every round has a real answer',
    rounds.every((r) => r.matchId >= 0 && r.matchId < 57)
  )
  check(
    'the answer is on BOTH cards',
    rounds.every(
      (r) =>
        r.layoutA.some((p) => p.symbolId === r.matchId) && r.layoutB.some((p) => p.symbolId === r.matchId)
    )
  )
  check(
    'the answer is the ONLY symbol on both cards',
    rounds.every((r) => {
      const b = new Set(r.layoutB.map((p) => p.symbolId))
      return r.layoutA.filter((p) => b.has(p.symbolId)).length === 1
    })
  )
  check(
    'every card shows 8 symbols',
    rounds.every((r) => r.layoutA.length === 8 && r.layoutB.length === 8)
  )
  check(
    'no card is reused inside one game',
    new Set(rounds.flatMap((r) => [r.cardIndexA, r.cardIndexB])).size === TOTAL_ROUNDS * 2
  )
  check(
    'every layout is geometrically legal',
    rounds.every((r) => validateLayout(r.layoutA).valid && validateLayout(r.layoutB).valid)
  )
  check(
    'the same seed reproduces the same rounds',
    JSON.stringify(buildRounds(999)) === JSON.stringify(buildRounds(999))
  )
  check('different seeds give different rounds', JSON.stringify(buildRounds(1)) !== JSON.stringify(buildRounds(2)))
}

// ---------------------------------------------------------------------------
console.log('\n— the answer is hidden from the guest —')
{
  let g = play(createGame(7))
  const snap = snapshotFor(g)
  check('live snapshot carries no matchId', snap.matchId === null)
  check('live snapshot still carries both layouts', snap.layoutA.length === 8 && snap.layoutB.length === 8)

  const r = currentRound(g)
  const res = submitClick(g, ROLE.HOST, r.matchId, 0)
  check('snapshot reveals the answer once the round is won', snapshotFor(res.game).matchId === r.matchId)
}

// ---------------------------------------------------------------------------
console.log('\n— click validation —')
{
  const base = play(createGame(42))
  const r = currentRound(base)
  const wrong = r.layoutA.find((p) => p.symbolId !== r.matchId).symbolId
  const notOnCards = [...Array(57).keys()].find(
    (id) => !r.layoutA.some((p) => p.symbolId === id) && !r.layoutB.some((p) => p.symbolId === id)
  )

  let res = submitClick(base, ROLE.HOST, r.matchId, 0, 1000)
  check('correct click is accepted', res.accepted && res.correct)
  check('correct click scores exactly 1', res.game.scores[ROLE.HOST] === 1)
  check('correct click ends the round', res.game.phase === PHASE.ROUND_END)
  check('correct click records the winner', res.game.roundWinner === ROLE.HOST)
  check('opponent score untouched', res.game.scores[ROLE.GUEST] === 0)

  const wrongRes = submitClick(base, ROLE.HOST, wrong, 0, 1000)
  check('wrong click is accepted but incorrect', wrongRes.accepted && !wrongRes.correct)
  check('wrong click scores nothing', wrongRes.game.scores[ROLE.HOST] === 0)
  check('wrong click does not end the round', wrongRes.game.phase === PHASE.PLAYING)

  const offCard = submitClick(base, ROLE.HOST, notOnCards, 0, 1000)
  check('symbol not on either card is rejected', !offCard.accepted && offCard.reason === REJECT.SYMBOL_NOT_ON_CARDS)

  const stale = submitClick(base, ROLE.HOST, r.matchId, 5, 1000)
  check('click from a stale round is rejected', !stale.accepted && stale.reason === REJECT.STALE_ROUND)

  const lobby = submitClick(createGame(42), ROLE.HOST, r.matchId, 0, 1000)
  check('click before the game starts is rejected', !lobby.accepted && lobby.reason === REJECT.NOT_PLAYING)
}

// ---------------------------------------------------------------------------
console.log('\n— one point per round, first click only —')
{
  const base = play(createGame(77))
  const r = currentRound(base)

  const first = submitClick(base, ROLE.HOST, r.matchId, 0, 1000)
  const second = submitClick(first.game, ROLE.GUEST, r.matchId, 0, 1100)
  check('second correct click is rejected', !second.accepted && second.reason === REJECT.ROUND_ALREADY_WON)
  check('loser of the round scores nothing', second.game.scores[ROLE.GUEST] === 0)

  const again = submitClick(first.game, ROLE.HOST, r.matchId, 0, 1400)
  check('winner cannot score twice in one round', !again.accepted)
  check('score stays at 1', again.game.scores[ROLE.HOST] === 1)
}

// ---------------------------------------------------------------------------
console.log('\n— spam and double-click guards —')
{
  const base = play(createGame(3))
  const r = currentRound(base)
  const wrong = r.layoutA.find((p) => p.symbolId !== r.matchId).symbolId

  const a = submitClick(base, ROLE.HOST, wrong, 0, 1000)
  const b = submitClick(a.game, ROLE.HOST, wrong, 0, 1050)
  check('rapid repeat click is throttled', !b.accepted && b.reason === REJECT.COOLDOWN)

  const c = submitClick(a.game, ROLE.HOST, wrong, 0, 1300)
  check('same symbol again inside 500ms is ignored', !c.accepted && c.reason === REJECT.DUPLICATE)

  const d = submitClick(a.game, ROLE.HOST, wrong, 0, 1700)
  check('same symbol after 500ms is allowed again', d.accepted)

  const guestSame = submitClick(a.game, ROLE.GUEST, wrong, 0, 1050)
  check('one player cannot throttle the other', guestSame.accepted)
}

// ---------------------------------------------------------------------------
console.log('\n— a full 9-round game —')
{
  let game = play(createGame(20260922))
  const winners = []
  let now = 0

  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    const r = currentRound(game)
    // Alternate who is faster, with a wrong click mixed in first.
    const role = i % 3 === 0 ? ROLE.GUEST : ROLE.HOST
    const wrong = r.layoutB.find((p) => p.symbolId !== r.matchId).symbolId

    now += 1000
    game = submitClick(game, role, wrong, i, now).game
    now += 1000
    const res = submitClick(game, role, r.matchId, i, now)
    game = res.game
    winners.push(role)

    if (i < TOTAL_ROUNDS - 1) {
      game = advanceRound(game)
      if (game.phase !== PHASE.PLAYING) break
    }
  }

  game = advanceRound(game)

  const hostWins = winners.filter((w) => w === ROLE.HOST).length
  const guestWins = winners.filter((w) => w === ROLE.GUEST).length

  check('game ends after 9 rounds', game.phase === PHASE.GAME_OVER)
  check('round index reached the last round', game.round === TOTAL_ROUNDS - 1)
  check('scores sum to 9', game.scores[ROLE.HOST] + game.scores[ROLE.GUEST] === TOTAL_ROUNDS)
  check('host score matches rounds host won', game.scores[ROLE.HOST] === hostWins)
  check('guest score matches rounds guest won', game.scores[ROLE.GUEST] === guestWins)
  check('no score exceeds 9', game.scores[ROLE.HOST] <= 9 && game.scores[ROLE.GUEST] <= 9)
  check('clicks after game over are rejected', !submitClick(game, ROLE.HOST, 0, 8, now + 5000).accepted)

  console.log(`      final: host ${game.scores[ROLE.HOST]} – ${game.scores[ROLE.GUEST]} guest`)
}

// ---------------------------------------------------------------------------
console.log('\n— result resolution —')
{
  check('higher score wins', resultFor({ host: 6, guest: 3 }, ROLE.HOST) === RESULT.WIN)
  check('lower score loses', resultFor({ host: 3, guest: 6 }, ROLE.HOST) === RESULT.LOSE)
  check('equal scores draw', resultFor({ host: 4, guest: 4 }, ROLE.HOST) === RESULT.DRAW)
  check('the two players see opposite results', resultFor({ host: 6, guest: 3 }, ROLE.GUEST) === RESULT.LOSE)
  check('a draw is a draw for both', resultFor({ host: 4, guest: 4 }, ROLE.GUEST) === RESULT.DRAW)
}

// ---------------------------------------------------------------------------
console.log('\n— 300 randomised games —')
{
  let bad = 0
  for (let s = 0; s < 300; s++) {
    let game = play(createGame(s * 7919 + 13))
    let now = 0
    for (let i = 0; i < TOTAL_ROUNDS; i++) {
      const r = currentRound(game)
      const role = Math.random() < 0.5 ? ROLE.HOST : ROLE.GUEST
      now += 500
      const res = submitClick(game, role, r.matchId, i, now)
      if (!res.accepted || !res.correct) bad++
      game = res.game
      game = advanceRound(game)
    }
    if (game.phase !== PHASE.GAME_OVER) bad++
    if (game.scores.host + game.scores.guest !== TOTAL_ROUNDS) bad++
  }
  check('300 games all completed correctly', bad === 0, `${bad} anomalies`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
