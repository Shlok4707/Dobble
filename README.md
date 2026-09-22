# Among Us Dobble

A two-player Dobble / Spot It game played between **two PCs over the internet**, built with **React + Vite + Tailwind CSS** and **no backend of any kind**.

One PC generates a 4-character code. The other types it in. That's the whole setup — no accounts, no server to deploy, no database.

---

## Quick start

```bash
npm install
npm run dev
```

Open the printed URL on **both** PCs (each PC runs its own copy — see *Playing across two machines* below).

- PC 1 → **Create Code** → read the 4 characters off the screen
- PC 2 → **Join Code** → type them → **Click to Play**

Both screens then count down `3 → 2 → 1 → START` together and the game begins.

---

## How two PCs find each other, with no backend

The game opens **two routes at once** and keeps whichever one your network
actually allows. You never choose; it just connects.

```
            ┌──────────────── route 1: DIRECT ────────────────┐
PC 1 ◄──────┤  WebRTC, browser to browser. Fast and private.  ├──────► PC 2
            │  Needs to punch through both NATs/firewalls.    │
            └────────────────────────────────────────────────┘

            ┌──────────────── route 2: RELAY ─────────────────┐
PC 1 ◄──────┤  Both PCs connect OUT to a shared broker over   ├──────► PC 2
            │  WebSocket Secure :443. No hole punching at     │
            │  all — works wherever a web page loads.         │
            └────────────────────────────────────────────────┘
```

The host advertises the code on both. The guest dials both. The first channel
to actually carry a message wins, and the other is closed.

**This is why campus and office Wi-Fi no longer breaks the game.** Direct WebRTC
needs UDP and a successful NAT traversal, which many managed networks simply do
not permit — and when it fails, it fails silently. The relay needs nothing more
than an outbound HTTPS-style connection, so it gets through.

### How the code works

- **Create Code** rolls a 4-character code and claims it on both routes. If it
  is already in use, the app silently rolls another — so a live code is unique.
- **Join Code** dials that exact code on both routes. Wrong code, no connection.
- Pressing **Back** or closing the tab releases the code immediately.

### Who referees

The host's browser is the server. It owns the deck, the round number, both
scores, the answer and who won each round. The guest renders what it is told and
sends clicks. **The answer is never sent to the guest while a round is live** —
the snapshot carries `matchId: null` until somebody wins the round, so it cannot
be read out of memory or the network tab.

### Why a slow connection is not a disadvantage

The host's own clicks reach the referee instantly; the guest's have to travel.
Over the relay that can be 150ms or more, and in a game about who clicks first
that would hand the host almost every round.

So rounds are **not** decided by arrival order. Both machines' clocks are
synchronised the way NTP does it (`src/game/clock.js`), each click is stamped
with *when it happened* in a shared time frame, the host holds a short
arbitration window, and the **earliest stamp wins**. Travel time stops mattering.

```bash
npm run test:fairness   # proves the sync maths and the arbitration rule
```

---

## If it will not connect

Open **`http://localhost:5173/diagnostics.html`** on both PCs. It is a
dependency-free page that tests every route and tells you exactly what that
network permits: the matchmaking service, STUN, TURN, and the relay.

Common outcomes:

| What it says | What to do |
|---|---|
| Relay works, direct blocked | Nothing — the game uses the relay automatically. |
| Everything blocked | Tether one PC to a phone hotspot, or use your own broker (below). |
| Relay blocked, direct works | Should still work; if not, use a hotspot. |

### Running your own services

Useful on a network that blocks the public ones, or if you would rather not
depend on them. Both PCs must be able to reach the machine running this.

```bash
npm run broker      # PeerJS broker on :9000, relay on :9001
```

Then create `.env` (copy `.env.example`) on **both** PCs:

```
VITE_PEER_HOST=192.168.1.42     # the LAN IP of the machine running the broker
VITE_PEER_PORT=9000
VITE_PEER_SECURE=false
VITE_RELAY_URL=ws://192.168.1.42:9001/mqtt
```

On the same Wi-Fi this needs no internet at all.

---

## Playing across two machines

WebRTC and microphone-style APIs require a **secure context**, which means
`localhost` or HTTPS.

**Easiest — each PC runs its own copy** (both are on `localhost`, so it just works):

```bash
npm run dev     # on PC 1
npm run dev     # on PC 2
```

**Or deploy it once** and both PCs open the same URL. It is a static site:

```bash
npm run build   # outputs dist/
```

Drop `dist/` on Vercel, Netlify, GitHub Pages or Cloudflare Pages.

> Opening PC 2 at `http://<PC1-LAN-IP>:5173` will **not** work: that is neither
> `localhost` nor HTTPS, so the browser blocks the connection APIs.

---

## The screens

Exactly the seven from the spec, plus a Draw screen for tied scores.

| Screen | File | What's on it |
|---|---|---|
| Home Page | `src/pages/HomePage.jsx` | Create Code · Join Code |
| Code Created Page | `src/pages/CodeCreatedPage.jsx` | the live 4-character code, Copy, Back (bottom-right) |
| Join Code Page | `src/pages/JoinCodePage.jsx` | code entry, Click to Play, Back (bottom-right) |
| Game Start Timer Page | `src/pages/GameStartTimerPage.jsx` | `3 → 2 → 1 → START`, driven by the host |
| Game BG Page | `src/pages/GameBGPage.jsx` | the two cards, scoreboard, round banner |
| Winner Page | `src/pages/WinnerPage.jsx` | final score out of 9, back to Home |
| Lost Page | `src/pages/LostPage.jsx` | final score out of 9, back to Home |
| *Draw Page* | `src/pages/DrawPage.jsx` | shown to both players on a tie |

Each screen is your mockup, rendered at its exact aspect ratio inside a letterboxed "stage" (`src/components/Stage.jsx`). Overlays are positioned in percentages and sized in container-query units (`cqw` / `cqh`), so the live parts stay glued to the artwork at every window size.

---

## The deck maths

`src/game/deckgen.js` builds a **finite projective plane of order 7**:

```
symbols        = n² + n + 1 = 57
cards          = n² + n + 1 = 57
symbols/card   = n + 1      = 8
```

Its defining property is that **any two cards share exactly one symbol** — never zero, never two. That's what guarantees every round has exactly one valid answer.

The deck is generated **once**, verified across all 1,596 card pairs, and written to `src/game/deck.js`. It is never regenerated during gameplay.

```bash
npm run gen:deck     # regenerate + verify + write
npm run test:deck    # verify what's committed
```

A game draws 18 distinct cards from a Fisher-Yates shuffle and pairs them into 9 rounds, so no card is ever seen twice in one game.

---

## Symbol placement

`src/game/layout.js` gives every symbol a random position, a random rotation (0°–360°) and a random scale, and guarantees:

- every symbol sits **fully inside** the circular card
- **no two symbols overlap or touch** — there's always at least 4px of clear space

It places symbols by dart-throwing with rejection sampling, exactly as the spec describes. The one addition: if a card can't be packed after 600 attempts per symbol, every radius shrinks by 4.5% and it re-packs. That makes failure impossible rather than merely unlikely, which matters because a card that failed to pack would stall a round.

**A detail that makes symbols look right:** packing is done on *circles*, but what's drawn is a *rectangle* with the image's own aspect ratio. Each image is fitted as the largest rectangle of its aspect ratio that fits inside its circle:

```
w = 2r·a / √(a²+1)      h = 2r / √(a²+1)      a = width/height
```

Because the rectangle is inscribed in the circle, and the circles never overlap, **the visible artwork never overlaps either** — at any rotation. And because it uses each image's real proportions rather than a square box, a tall crewmate or a wide task panel fills its circle instead of wasting half of it.

```bash
npm run test:layout   # 5,000 cards / 40,000 placements, asserts zero overlaps
```

---

## Clicking

The spec is strict that only the actual objects may register an answer. Two layers enforce it:

1. **Pointer events.** The card, its rim, the gaps between symbols, the page background and the scoreboard are all `pointer-events: none`. Only the `<img>` elements re-enable them.
2. **Alpha testing.** CSS can only give a rectangular hit box, so a click in the transparent corner of a symbol would still land on it. `src/game/hitTest.js` samples the image's own alpha channel at the exact click point and ignores the click if that pixel is transparent.

The rotation is handled for free: `offsetX`/`offsetY` are reported in the element's own untransformed coordinate space, so the alpha sample always lines up with what was actually clicked.

```bash
npm run test:e2e:clicks   # clicks real coordinates and proves all of the above
```

---

## Your artwork

All 57 images live in `src/assets/symbols/` and are picked up **automatically in natural filename order** — there's no manifest to maintain. To swap in different art, drop the files in and delete the old ones. That's the whole job.

If the folder doesn't hold 57 images, the app says so on a dedicated screen instead of failing mysteriously.

Screen backgrounds live in `src/assets/screens/`.

`npm run gen:symbols` regenerates a throwaway placeholder set (19 crewmate colours × 3 accessories), useful if you ever want to test without the real art.

---

## Sound

Six cues — countdown tick, start, correct, wrong, win, lose — are **synthesised live with the Web Audio API** from oscillators (`src/game/sound.js`). No audio files, nothing to preload, nothing to 404. There's a mute toggle in the top-left corner.

---

## Leaving, disconnects and cleanup

Pressing **Back** or **Go Back to Home Screen** destroys the peer, which releases the 4-character code and sends a `LEAVE` to the other PC. The other player is returned to the Home Page with a notice rather than being left staring at a frozen game.

The same happens if a browser is closed, reloaded or loses its connection — `close` and `error` on the data channel are treated exactly like a deliberate exit. Closing the tab also fires a `LEAVE` on `beforeunload`.

---

## Tests

```bash
npm test                  # deck maths, placement, game rules, fairness (no browser)
npm run test:e2e          # two real browsers, a real connection, a full 9-round game
npm run test:e2e:clicks   # the clickability rules, against real screen coordinates
```

The end-to-end tests need a running build:

```bash
npm run build && npm run preview     # then, in another terminal, npm run test:e2e
```

What is covered:

- all 1,596 card pairs share exactly one symbol
- 40,000 symbol placements with zero overlaps and nothing outside the card
- 44 rule assertions: first-correct-click wins, one point per round, no double
  scoring, wrong clicks score nothing, stale-round clicks rejected, symbols not
  on the cards rejected, spam and double-click guards, 9-round completion,
  win/lose/draw resolution, 300 randomised full games
- 6 fairness assertions: clock offset recovered to within the link's jitter on
  fast, slow and jittery links; the player who clicked first wins even when
  their message arrives second; over 500 rounds, wins track real reaction time
- 24 end-to-end assertions, run twice — **once over a direct connection and once
  with WebRTC deliberately unreachable so the relay carries the whole game** —
  covering wrong codes, identical cards each round, round sync, scores matching
  rounds won, correct Winner/Lost routing, Back releasing both PCs, and a
  mid-game disconnect not stranding the other player
- 8 clickability assertions, including that clicking a symbol's transparent
  pixels does **not** score while clicking its artwork does

## Project layout

```
src/
  game/
    deckgen.js        projective plane generator + verifier
    deck.js           the generated 57-card deck (do not edit)
    layout.js         circular packing, rotation, scale, overlap avoidance
    rng.js            seeded RNG + Fisher-Yates
    symbols.js        auto-discovers src/assets/symbols/, preloads, validates
    hitTest.js        alpha-channel click testing
    engine.js         authoritative rules — pure, no React, no network
    protocol.js       wire messages, screen names, code generation
    sound.js          Web Audio cues
    GameProvider.jsx  PeerJS wiring + state machine
  components/
    Stage.jsx         letterboxed fixed-aspect backdrop for the mockups
    DobbleCard.jsx    the circular card and its symbols
    ChunkyButton.jsx  the Among Us style button
    BackButton.jsx    bottom-right Back
    LoadingScreen.jsx asset preloading progress
    AssetError.jsx    shown if the symbol folder is wrong
  pages/              one file per screen
  assets/
    symbols/          the 57 card images
    screens/          the 7 screen backgrounds
scripts/              deck generation, verification, tests, local broker
```
