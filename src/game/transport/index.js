/**
 * Transport selection.
 *
 * The two PCs have two possible ways to reach each other:
 *
 *   webrtc — direct browser-to-browser. Fast, private, but needs to punch
 *            through both networks' NAT/firewall, which many networks forbid.
 *   relay  — both sides connect outbound to a shared broker over WSS:443.
 *            Slower, but works essentially anywhere a web page loads.
 *
 * Rather than guess which one a given network allows, we open BOTH and let the
 * connection decide: the host advertises on both, the guest dials both, and the
 * first channel that actually carries a message wins. The loser is closed.
 *
 * This is why a campus or office network no longer breaks the game — WebRTC
 * can fail completely and the relay picks it up without the player noticing.
 */

import { generateCode } from '../protocol.js'
import * as webrtc from './webrtc.js'
import * as relay from './relay.js'

export const REASON = {
  CODE_TAKEN: 'CODE_TAKEN',
  NO_HOST: 'NO_HOST',
  NO_BROKER: 'NO_BROKER',
  BLOCKED: 'BLOCKED',
}

const MAX_CODE_ATTEMPTS = 6

/* ------------------------------------------------------------------- host */

/**
 * Claim a unique code and listen for a guest on every transport available.
 *
 * @returns {Promise<{code, transports: string[], close(): void}>}
 *          resolves once the code is live; `onGuest(channel)` fires later.
 */
export async function openHost({ onStatus, onGuest, onTransports }) {
  const failures = []

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateCode()
    let bound = false
    const candidates = []
    let webrtcHandle = null

    const bind = (channel, firstMessage) => {
      if (bound) {
        channel.close()
        return
      }
      bound = true

      // Shut every other way in, so there is exactly one live connection.
      for (const other of candidates) if (other !== channel) other.close()
      if (webrtcHandle && channel.kind !== 'webrtc') webrtcHandle.close()

      onGuest?.(channel)
      // The provider installs its own handlers inside onGuest, so the message
      // that triggered the binding is replayed once they are in place.
      queueMicrotask(() => channel.emit(firstMessage))
    }

    const arm = (channel) => {
      candidates.push(channel)
      channel.setHandlers({ onData: (msg) => bind(channel, msg), onClose: () => {} })
    }

    const [webrtcResult, relayResult] = await Promise.allSettled([
      webrtc.webrtcClaimHost({ code, onStatus, onGuest: arm }),
      relay.relayClaimHost({ code, onStatus }),
    ])

    if (webrtcResult.status === 'fulfilled') webrtcHandle = webrtcResult.value
    if (relayResult.status === 'fulfilled') arm(relayResult.value)

    const taken =
      webrtcResult.reason?.code === REASON.CODE_TAKEN || relayResult.reason?.code === REASON.CODE_TAKEN

    if (taken) {
      // Someone else holds this code. Release whatever we did claim and reroll.
      webrtcHandle?.close()
      candidates.forEach((c) => c.close())
      continue
    }

    const transports = []
    if (webrtcResult.status === 'fulfilled') transports.push('webrtc')
    if (relayResult.status === 'fulfilled') transports.push('relay')

    if (transports.length === 0) {
      failures.push({
        webrtc: webrtcResult.reason?.code,
        relay: relayResult.reason?.code,
      })
      break
    }

    onTransports?.(transports)

    return {
      code,
      transports,
      close() {
        webrtcHandle?.close()
        candidates.forEach((c) => c.close())
      },
    }
  }

  throw Object.assign(new Error('Could not open a game'), {
    code: REASON.NO_BROKER,
    failures,
  })
}

/* ------------------------------------------------------------------ guest */

/** Resolve with the first promise to fulfil; if all reject, reject with them all. */
function firstFulfilled(entries) {
  return new Promise((resolve, reject) => {
    let remaining = entries.length
    let won = false
    const errors = {}

    entries.forEach(({ name, promise }) => {
      promise.then(
        (value) => {
          if (won) {
            // A late winner is redundant — close it rather than leak a socket.
            try {
              value.close()
            } catch {
              /* ignore */
            }
            return
          }
          won = true
          resolve({ name, value })
        },
        (err) => {
          errors[name] = err?.code || 'UNKNOWN'
          remaining--
          if (!won && remaining === 0) {
            reject(Object.assign(new Error('Could not connect'), { reasons: errors }))
          }
        }
      )
    })
  })
}

/**
 * Dial a host by code over every transport at once and keep the first that
 * connects.
 *
 * @returns {Promise<{channel, via: 'webrtc'|'relay'}>}
 */
export async function joinGame({ code, onStatus }) {
  const { name, value } = await firstFulfilled([
    { name: 'webrtc', promise: webrtc.webrtcJoin({ code, onStatus }) },
    { name: 'relay', promise: relay.relayJoin({ code, onStatus }) },
  ])
  return { channel: value, via: name }
}

/**
 * Turn a pair of transport failures into something a player can act on.
 * The old code said "No active game with that code" for every failure,
 * including the very common case where the game was found but the network
 * blocked the connection.
 */
export function describeJoinFailure(reasons = {}) {
  const values = Object.values(reasons)
  const has = (code) => values.includes(code)

  // BLOCKED means the host was *found* and the channel still would not open,
  // so this is a network problem, never a wrong code. It outranks everything.
  if (has(REASON.BLOCKED)) {
    return has(REASON.NO_BROKER)
      ? 'Your network is blocking the connection and the backup relay is unreachable. Try a phone hotspot on one of the PCs.'
      : 'Found the game, but the connection was blocked. Make sure both PCs are on the latest version and try again.'
  }

  // If any transport got through and reported that nothing is advertising this
  // code, that is a real answer — even if the other transport was down.
  if (has(REASON.NO_HOST)) {
    return 'No active game with that code. Check the code and try again.'
  }

  // Nothing got through at all.
  if (values.length && values.every((v) => v === REASON.NO_BROKER)) {
    return 'Cannot reach the internet. Check your connection and try again.'
  }

  return 'Could not connect to that game. Check the code, or try a different network.'
}
