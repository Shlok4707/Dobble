/**
 * Proves the clickability rules the spec insists on:
 *
 *   - the card background must NOT be clickable
 *   - empty areas inside the cards must NOT be clickable
 *   - the game background must NOT be clickable
 *   - the score / labels / decoration must NOT be clickable
 *   - a click on a symbol's TRANSPARENT pixels must NOT count
 *   - a click on the symbol's actual artwork MUST count
 *
 * Every assertion is made against a running browser, by clicking real screen
 * coordinates. Transparent and opaque sample points are found by reading the
 * symbol's own alpha channel in-page, then mapped back through the symbol's
 * rotation so the click lands exactly where intended.
 *
 *   node scripts/e2e-clickability.mjs
 */
import { chromium } from 'playwright'

const URL = process.env.E2E_URL || 'http://localhost:4173/'

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

const roundEnded = (page) =>
  // innerText reflects CSS text-transform, so match case-insensitively.
  page.evaluate(() => /you got it!|opponent got it/i.test(document.body.innerText))

const scoreOf = (page) =>
  page.evaluate(() => {
    const m = document.body.innerText.match(/YOU\s*(\d+)/i)
    return m ? Number(m[1]) : null
  })

/**
 * Map a point in a symbol's own (unrotated) coordinate space to viewport
 * coordinates, undoing nothing and applying the same rotation the CSS applies.
 * Rotation is about the element's centre, so the centre is a fixed point.
 */
async function pointOnSymbol(page, alt, u, v) {
  return page.evaluate(
    ({ alt, u, v }) => {
      const img = document.querySelector(`[aria-label="Card one"] img[alt="${CSS.escape(alt)}"]`)
      if (!img) return null
      const rot = parseFloat(img.parentElement.style.getPropertyValue('--rot')) || 0
      const t = (rot * Math.PI) / 180
      const r = img.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const w = img.offsetWidth
      const h = img.offsetHeight
      const dx = (u - 0.5) * w
      const dy = (v - 0.5) * h
      return {
        x: cx + dx * Math.cos(t) - dy * Math.sin(t),
        y: cy + dx * Math.sin(t) + dy * Math.cos(t),
      }
    },
    { alt, u, v }
  )
}

/** Read the symbol's alpha channel and return a solidly-transparent and a
 *  solidly-opaque sample point, in the image's own 0..1 coordinates. */
async function alphaSamples(page, alt) {
  return page.evaluate(
    ({ alt }) =>
      new Promise((resolve) => {
        const el = document.querySelector(`[aria-label="Card one"] img[alt="${CSS.escape(alt)}"]`)
        if (!el) return resolve(null)
        const N = 64
        const img = new Image()
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = N
          c.height = N
          const ctx = c.getContext('2d', { willReadFrequently: true })
          const ratio = Math.min(N / img.naturalWidth, N / img.naturalHeight)
          const w = img.naturalWidth * ratio
          const h = img.naturalHeight * ratio
          ctx.drawImage(img, (N - w) / 2, (N - h) / 2, w, h)
          const d = ctx.getImageData(0, 0, N, N).data
          const a = (x, y) => d[(y * N + x) * 4 + 3]

          const clearAround = (x, y, rad) => {
            for (let dy = -rad; dy <= rad; dy++)
              for (let dx = -rad; dx <= rad; dx++) {
                const nx = x + dx
                const ny = y + dy
                if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue
                if (a(nx, ny) > 8) return false
              }
            return true
          }
          const solidAround = (x, y, rad) => {
            for (let dy = -rad; dy <= rad; dy++)
              for (let dx = -rad; dx <= rad; dx++) {
                const nx = x + dx
                const ny = y + dy
                if (nx < 0 || ny < 0 || nx >= N || ny >= N) return false
                if (a(nx, ny) < 200) return false
              }
            return true
          }

          let transparent = null
          let opaque = null
          // Prefer transparent pixels far from the centre (the corners).
          const byCorner = []
          for (let y = 0; y < N; y++)
            for (let x = 0; x < N; x++) byCorner.push([x, y, Math.hypot(x - N / 2, y - N / 2)])
          byCorner.sort((p, q) => q[2] - p[2])
          for (const [x, y] of byCorner) {
            if (clearAround(x, y, 4)) {
              transparent = { u: (x + 0.5) / N, v: (y + 0.5) / N }
              break
            }
          }
          // Prefer opaque pixels near the centre.
          byCorner.sort((p, q) => p[2] - q[2])
          for (const [x, y] of byCorner) {
            if (solidAround(x, y, 3)) {
              opaque = { u: (x + 0.5) / N, v: (y + 0.5) / N }
              break
            }
          }
          resolve({ transparent, opaque })
        }
        img.onerror = () => resolve(null)
        img.src = el.src
      }),
    { alt }
  )
}

const main = async () => {
  const browser = await chromium.launch({
    executablePath: process.env.E2E_CHROME || undefined,
    args: ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  })
  const host = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage()
  const guest = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage()

  try {
    await host.goto(URL)
    await guest.goto(URL)
    await host.waitForSelector('text=Create Code')
    await host.click('text=Create Code')
    await host.waitForSelector('text=Copy code', { timeout: 30000 })
    const code = await host.evaluate(() =>
      [...document.querySelectorAll('span')]
        .filter((s) => s.textContent.length === 1 && /[A-Z2-9]/.test(s.textContent))
        .slice(0, 4)
        .map((s) => s.textContent)
        .join('')
    )
    await guest.click('text=Join Code')
    await guest.waitForSelector('text=Click to Play')
    await guest.fill('input[aria-label^="Enter the"]', code)
    await guest.click('text=Click to Play')
    await host.waitForSelector('[aria-label="Card one"] img', { timeout: 30000 })
    await host.waitForTimeout(600)

    const before = await scoreOf(host)

    // ---------------------------------------------- the game background
    await host.mouse.click(30, 780)
    await host.mouse.click(1410, 760)
    check('clicking the game background does nothing', !(await roundEnded(host)) && (await scoreOf(host)) === before)

    // --------------------------------------------------- the scoreboard
    const scoreBox = await host.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find((d) => /ROUND/i.test(d.innerText) && d.children.length === 2)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    if (scoreBox) await host.mouse.click(scoreBox.x, scoreBox.y)
    check('clicking the scoreboard does nothing', !(await roundEnded(host)) && (await scoreOf(host)) === before)

    // ------------------------------------- empty space inside the card
    const gap = await host.evaluate(() => {
      const card = document.querySelector('[aria-label="Card one"]')
      const r = card.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const R = r.width / 2
      const boxes = [...card.querySelectorAll('img')].map((i) => i.getBoundingClientRect())
      // Walk the card looking for a point well inside the disc but outside
      // every symbol's box.
      for (let ring = 0.15; ring < 0.9; ring += 0.05) {
        for (let a = 0; a < 360; a += 5) {
          const t = (a * Math.PI) / 180
          const x = cx + Math.cos(t) * R * ring
          const y = cy + Math.sin(t) * R * ring
          const clear = boxes.every((b) => x < b.left - 12 || x > b.right + 12 || y < b.top - 12 || y > b.bottom + 12)
          if (clear) return { x, y }
        }
      }
      return null
    })
    check('found empty space inside the card to test', !!gap)
    if (gap) await host.mouse.click(gap.x, gap.y)
    check(
      'clicking empty space inside the card does nothing',
      !(await roundEnded(host)) && (await scoreOf(host)) === before
    )

    // ------------------------- transparent pixels of the MATCHING symbol
    //
    // 10 of the 57 symbols are rectangular task panels with no transparency at
    // all, so the round's answer is not always testable. Walk the rounds until
    // one comes up that is, playing each round out as we go.
    let tested = false

    for (let round = 0; round < 9 && !tested; round++) {
      await host.waitForSelector('[aria-label="Card one"] img', { timeout: 15000 })
      await host.waitForTimeout(350)

      const baseline = await scoreOf(host)
      const a = await host.$$eval('[aria-label="Card one"] img', (i) => i.map((x) => x.alt))
      const bSet = new Set(await host.$$eval('[aria-label="Card two"] img', (i) => i.map((x) => x.alt)))
      const match = a.find((x) => bSet.has(x))
      const samples = await alphaSamples(host, match)

      if (samples?.transparent && samples?.opaque) {
        console.log(`      testing on "${match}" (round ${round + 1})`)

        const clear = await pointOnSymbol(host, match, samples.transparent.u, samples.transparent.v)
        await host.mouse.click(clear.x, clear.y)
        await host.waitForTimeout(450)
        check(
          'clicking TRANSPARENT pixels of the winning symbol does NOT score',
          !(await roundEnded(host)) && (await scoreOf(host)) === baseline
        )

        const solid = await pointOnSymbol(host, match, samples.opaque.u, samples.opaque.v)
        await host.mouse.click(solid.x, solid.y)
        await host.waitForTimeout(700)
        check('clicking the ARTWORK of the same symbol DOES score', await roundEnded(host))
        check('score went up by exactly 1', (await scoreOf(host)) === baseline + 1)
        tested = true
      } else {
        // A fully opaque panel — nothing to prove here, just play the round.
        console.log(`      "${match}" is a solid panel, trying the next round`)
        const box = await host
          .locator(`[aria-label="Card one"] img[alt="${match}"]`)
          .first()
          .boundingBox()
        await host.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await host.waitForTimeout(2200)
      }
    }

    check('found a symbol with transparency to test against', tested)

  } finally {
    await browser.close()
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('crashed:', e.message)
  process.exit(1)
})
