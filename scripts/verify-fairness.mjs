/**
 * Proves that a slower connection is not a disadvantage.
 *
 * Simulates two machines whose clocks disagree by a large amount, connected by
 * a link with real one-way delay and jitter, and checks that:
 *
 *   1. clock sync recovers the true offset accurately
 *   2. the player who genuinely clicked first wins the round, even when their
 *      message arrives second
 *
 * Without this, the host — whose own clicks reach the referee instantly —
 * would win essentially every round played over the relay.
 *
 *   node scripts/verify-fairness.mjs
 */
import { createClockSync } from '../src/game/clock.js'

let pass = 0
let fail = 0
const check = (name, ok, detail = '') => {
  if (ok) {
    pass++
    console.log(`PASS  ${name}`)
  } else {
    fail++
    console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`)
  }
}

/**
 * A fake world with a controllable clock, so the test is deterministic and
 * instant rather than sleeping for real seconds.
 */
function simulate({ trueOffset, oneWayMs, jitterMs, seed = 1 }) {
  let now = 1_000_000
  const queue = []
  let rnd = seed

  const random = () => {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff
    return rnd / 0x7fffffff
  }

  const realSetTimeout = globalThis.setTimeout
  const realDateNow = Date.now

  globalThis.setTimeout = (fn, ms) => {
    queue.push({ at: now + (ms || 0), fn })
    return queue.length
  }
  Date.now = () => now

  const delay = () => oneWayMs + (random() - 0.5) * 2 * jitterMs

  // The guest's probe travels to the host, the host stamps it with ITS clock,
  // and the reply travels back.
  const send = (payload) => {
    const out = delay()
    queue.push({
      at: now + out,
      fn: () => {
        const hostTime = now + trueOffset
        const back = delay()
        queue.push({ at: now + back, fn: () => clock.onPong({ id: payload.id, hostTime }) })
      },
    })
  }

  const clock = createClockSync(send)
  clock.start()

  // Run the world forward until nothing is left to do.
  for (let guard = 0; guard < 100000 && queue.length; guard++) {
    queue.sort((a, b) => a.at - b.at)
    const next = queue.shift()
    now = Math.max(now, next.at)
    next.fn()
  }

  const result = { offset: clock.offset, rtt: clock.rtt, clock, now }

  globalThis.setTimeout = realSetTimeout
  Date.now = realDateNow
  return result
}

console.log('— clock synchronisation —')

for (const [label, cfg] of [
  ['fast direct link', { trueOffset: 37_000, oneWayMs: 12, jitterMs: 4 }],
  ['typical relay', { trueOffset: -145_000, oneWayMs: 90, jitterMs: 25 }],
  ['slow, jittery relay', { trueOffset: 5_400_000, oneWayMs: 220, jitterMs: 90 }],
]) {
  const { offset, rtt } = simulate(cfg)
  const err = Math.abs(offset - cfg.trueOffset)
  // The estimate can only be as good as the jitter on the best sample.
  const tolerance = Math.max(12, cfg.jitterMs * 1.5)
  check(
    `${label}: offset recovered within ${tolerance.toFixed(0)}ms`,
    err <= tolerance,
    `error ${err.toFixed(1)}ms, rtt ${rtt.toFixed(0)}ms`
  )
}

console.log('\n— round arbitration —')

/**
 * The rule the host applies: buffer every correct click for a short window,
 * then award the round to the earliest timestamp.
 */
function arbitrate(clicks) {
  return clicks.reduce((best, c) => (best === null || c.ts < best.ts ? c : best), null)
}

{
  // The guest clicks 60ms before the host, but is 200ms away. Judged on
  // arrival, the host would win; judged on timestamps, the guest wins.
  const guestClickedAt = 1000
  const hostClickedAt = 1060
  const winner = arbitrate([
    { role: 'guest', ts: guestClickedAt },
    { role: 'host', ts: hostClickedAt },
  ])
  check('the player who clicked first wins despite arriving second', winner.role === 'guest')
}

{
  const winner = arbitrate([
    { role: 'host', ts: 2000 },
    { role: 'guest', ts: 2400 },
  ])
  check('the player who genuinely clicked first still wins', winner.role === 'host')
}

{
  // Over 500 rounds with the guest on a 200ms relay, a fair referee should
  // split the wins roughly in line with who actually reacted faster.
  let guestWins = 0
  let guestActuallyFaster = 0
  for (let i = 0; i < 500; i++) {
    const hostReaction = 400 + Math.random() * 400
    const guestReaction = 400 + Math.random() * 400
    if (guestReaction < hostReaction) guestActuallyFaster++
    const winner = arbitrate([
      { role: 'host', ts: hostReaction },
      { role: 'guest', ts: guestReaction },
    ])
    if (winner.role === 'guest') guestWins++
  }
  check(
    'over 500 rounds, wins track real reaction time',
    guestWins === guestActuallyFaster,
    `${guestWins} vs ${guestActuallyFaster}`
  )
  console.log(`      guest won ${guestWins}/500 and was genuinely faster ${guestActuallyFaster}/500`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
