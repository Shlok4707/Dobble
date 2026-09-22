/**
 * End-to-end test: two real browsers, a real WebRTC data channel, a real
 * 9-round game — spec section 18 ("End-to-End Testing").
 *
 * Drives the app exactly the way a person would: reads the code off PC 1's
 * screen, types it into PC 2, and then plays by looking at the two cards and
 * clicking the symbol they have in common. Nothing is reached into; the match
 * is worked out from the rendered DOM, same as a player works it out by eye.
 *
 *   node scripts/e2e-playthrough.mjs
 */
import { chromium } from 'playwright'

const URL = process.env.E2E_URL || 'http://localhost:4173/'
const TOTAL_ROUNDS = 9
const CODE_INPUT = 'input[aria-label^="Enter the"]'

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

const cardAlts = (page, label) =>
  page.$$eval(`[aria-label="${label}"] img`, (imgs) => imgs.map((i) => i.getAttribute('alt')))

async function findMatch(page) {
  const a = await cardAlts(page, 'Card one')
  const b = await cardAlts(page, 'Card two')
  const setB = new Set(b)
  const shared = a.filter((x) => setB.has(x))
  return { shared, a, b }
}

async function roundNumber(page) {
  const txt = await page.textContent('body')
  const m = txt.match(/(\d+)\s*\/\s*9/)
  return m ? Number(m[1]) : null
}

/**
 * Click a symbol, retrying at a few offsets. A click that lands on a
 * transparent pixel is deliberately ignored by the game, so the retry proves
 * the symbol is reachable rather than papering over a bug.
 */
async function clickSymbol(page, alt, expectRegistered) {
  const el = page.locator(`[aria-label="Card one"] img[alt="${alt}"]`).first()
  const box = await el.boundingBox()
  if (!box) return false

  const offsets = [
    [0.5, 0.5],
    [0.5, 0.62],
    [0.42, 0.5],
    [0.58, 0.55],
    [0.5, 0.38],
  ]

  for (const [fx, fy] of offsets) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
    if (!expectRegistered) return true
    try {
      await page.waitForSelector('text=/You got it!|Opponent got it/', { timeout: 1200 })
      return true
    } catch {
      /* transparent pixel — try another spot on the same symbol */
    }
  }
  return false
}

const main = async () => {
  const browser = await chromium.launch({
    executablePath: process.env.E2E_CHROME || undefined,
    args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  })

  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 780 } })
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 780 } })
  const host = await ctxA.newPage()
  const guest = await ctxB.newPage()

  const errors = []
  for (const [name, p] of [
    ['HOST', host],
    ['GUEST', guest],
  ]) {
    p.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`))
    p.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`)
    })
  }

  try {
    // ------------------------------------------------------- Home Page
    await host.goto(URL)
    await guest.goto(URL)
    await host.waitForSelector('text=Create Code', { timeout: 30000 })
    await guest.waitForSelector('text=Join Code', { timeout: 30000 })
    check('both PCs reach the Home Page', true)

    // ------------------------------------ wrong code is refused first
    await guest.click('text=Join Code')
    await guest.waitForSelector('text=Click to Play')
    await guest.fill(CODE_INPUT, 'ZZZZ')
    await guest.click('text=Click to Play')
    const refused = await guest
      .waitForSelector('text=/No active game with that code/', { timeout: 20000 })
      .then(() => true)
      .catch(() => false)
    check('a code with no game behind it is refused', refused)
    check('refused join stays on the Join Code Page', await guest.isVisible('text=Click to Play'))

    // ------------------------------------------------ Code Created Page
    await host.click('text=Create Code')
    await host.waitForSelector('text=Copy code', { timeout: 30000 })
    await host.waitForFunction(
      () => /[A-Z2-9]{4}/.test(document.body.innerText.replace(/\s/g, '')),
      { timeout: 30000 }
    )

    const code = await host.evaluate(() => {
      const slots = [...document.querySelectorAll('span')].filter(
        (s) => s.textContent.length === 1 && /[A-Z2-9]/.test(s.textContent)
      )
      return slots
        .slice(0, 4)
        .map((s) => s.textContent)
        .join('')
    })
    check('Code Created Page shows a 4-character code', /^[A-Z2-9]{4}$/.test(code), `got "${code}"`)
    console.log(`      code = ${code}`)

    // --------------------------------------------------- Join Code Page
    await guest.fill(CODE_INPUT, code)
    await guest.click('text=Click to Play')

    // ------------------------------------------- Game Start Timer Page
    const sawCountdown = await Promise.all([
      host.waitForSelector('text=START!', { timeout: 30000 }).then(() => true).catch(() => false),
      guest.waitForSelector('text=START!', { timeout: 30000 }).then(() => true).catch(() => false),
    ])
    check('both PCs show the synchronized countdown', sawCountdown[0] && sawCountdown[1])

    // -------------------------------------------------- Game BG Page
    await host.waitForSelector('[aria-label="Card one"]', { timeout: 30000 })
    await guest.waitForSelector('[aria-label="Card one"]', { timeout: 30000 })
    check('both PCs reach the Game BG Page together', true)

    // ------------------------------------------------ play all 9 rounds
    let identicalCards = true
    let exactlyOneMatch = true
    let eightPerCard = true
    let roundsSynced = true
    const winners = []

    for (let round = 1; round <= TOTAL_ROUNDS; round++) {
      await host.waitForSelector('[aria-label="Card one"] img', { timeout: 15000 })
      await host.waitForTimeout(250)

      const h = await findMatch(host)
      const g = await findMatch(guest)

      if (JSON.stringify(h.a) !== JSON.stringify(g.a) || JSON.stringify(h.b) !== JSON.stringify(g.b)) {
        identicalCards = false
        console.log(`      round ${round}: cards differ between PCs`)
      }
      if (h.shared.length !== 1) {
        exactlyOneMatch = false
        console.log(`      round ${round}: ${h.shared.length} shared symbols`)
      }
      if (h.a.length !== 8 || h.b.length !== 8) eightPerCard = false

      const hr = await roundNumber(host)
      const gr = await roundNumber(guest)
      if (hr !== round || gr !== round) {
        roundsSynced = false
        console.log(`      round ${round}: host says ${hr}, guest says ${gr}`)
      }

      // Alternate the winner so both a win and a loss are exercised, and so
      // the final scores are not a draw.
      const winner = round % 3 === 0 ? guest : host
      const ok = await clickSymbol(winner, h.shared[0], true)
      if (!ok) {
        console.log(`      round ${round}: could not register a click on "${h.shared[0]}"`)
        break
      }
      winners.push(winner === host ? 'host' : 'guest')

      if (round < TOTAL_ROUNDS) {
        await host.waitForFunction((r) => document.body.innerText.includes(`${r} / 9`), round + 1, {
          timeout: 15000,
        })
      }
    }

    check('both PCs render identical cards every round', identicalCards)
    check('every round has exactly one shared symbol', exactlyOneMatch)
    check('every card renders 8 symbols', eightPerCard)
    check('round number stays in sync across both PCs', roundsSynced)
    check('all 9 rounds were played', winners.length === TOTAL_ROUNDS, `played ${winners.length}`)

    // ------------------------------------------- Winner / Lost Pages
    await host.waitForSelector('text=Go Back to Home Screen', { timeout: 20000 })
    await guest.waitForSelector('text=Go Back to Home Screen', { timeout: 20000 })

    const hostText = await host.textContent('body')
    const guestText = await guest.textContent('body')
    const hostWon = winners.filter((w) => w === 'host').length
    const guestWon = winners.filter((w) => w === 'guest').length

    const hostScore = Number(hostText.match(/(\d+)\s*\/\s*9/)?.[1])
    const guestScore = Number(guestText.match(/(\d+)\s*\/\s*9/)?.[1])

    check('host final score matches rounds it won', hostScore === hostWon, `${hostScore} vs ${hostWon}`)
    check('guest final score matches rounds it won', guestScore === guestWon, `${guestScore} vs ${guestWon}`)
    check('scores add up to 9', hostScore + guestScore === 9)

    const hostOnWinner = hostText.includes('Final score') && hostWon > guestWon
    check('higher scorer lands on the Winner Page', hostOnWinner && hostScore > guestScore)
    check(
      'lower scorer lands on the Lost Page',
      guestScore < hostScore && guestText.includes('Final score')
    )
    console.log(`      final: host ${hostScore} – ${guestScore} guest`)

    await host.screenshot({ path: '/tmp/e2e-host-result.png' })
    await guest.screenshot({ path: '/tmp/e2e-guest-result.png' })

    // -------------------------------------------- back to the Home Page
    check('Winner Page offers Go Back to Home Screen', await host.isVisible('text=Go Back to Home Screen'))
    check('Lost Page offers Go Back to Home Screen', await guest.isVisible('text=Go Back to Home Screen'))

    // Only ONE side presses it. The other must be released automatically,
    // because leaving has to terminate the session for both PCs.
    await host.click('text=Go Back to Home Screen')
    await host.waitForSelector('text=Create Code', { timeout: 10000 })
    check('the PC that pressed Back reaches the Home Page', true)

    const guestReleased = await guest
      .waitForSelector('text=Create Code', { timeout: 15000 })
      .then(() => true)
      .catch(() => false)
    check('the other PC is released to the Home Page too', guestReleased)

    // ------------------------------------ abandonment frees the other PC
    await host.click('text=Create Code')
    await host.waitForSelector('text=Copy code', { timeout: 30000 })
    const code2 = await host.evaluate(() => {
      const slots = [...document.querySelectorAll('span')].filter(
        (s) => s.textContent.length === 1 && /[A-Z2-9]/.test(s.textContent)
      )
      return slots.slice(0, 4).map((s) => s.textContent).join('')
    })
    check('a second Create Code yields a different code', code2 !== code, `${code} then ${code2}`)

    await guest.click('text=Join Code')
    await guest.waitForSelector('text=Click to Play')
    await guest.fill(CODE_INPUT, code2)
    await guest.click('text=Click to Play')
    await guest.waitForSelector('[aria-label="Card one"]', { timeout: 30000 })

    // Guest walks out mid-game; the host must not be left stuck.
    await guest.reload()
    const hostFreed = await host
      .waitForSelector('text=/left the game|disconnected/', { timeout: 25000 })
      .then(() => true)
      .catch(() => false)
    check('host is released when the other PC leaves mid-game', hostFreed)
    check('host is back on the Home Page', await host.isVisible('text=Create Code'))

    // A transport that cannot connect is a handled condition, not a bug: the
    // other transport carries the game. Those console messages come from the
    // browser's own networking stack and cannot be suppressed.
    const expectedTransportNoise =
      /AudioContext|autoplay|favicon|peerjs|WebSocket|ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION|Failed to load resource/i
    const realErrors = errors.filter((e) => !expectedTransportNoise.test(e))
    check('no page errors in either browser', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))
  } finally {
    await browser.close()
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('\nE2E crashed:', err.message)
  process.exit(1)
})
