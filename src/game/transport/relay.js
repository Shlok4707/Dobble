/**
 * Relay transport.
 *
 * Both PCs connect outbound to a shared public message broker over WebSocket
 * Secure (port 443/8084) and exchange messages through a topic derived from the
 * game code. There is no hole punching, no STUN, no TURN and no UDP — it is the
 * same kind of connection a browser makes to load a web page, so it works on
 * networks that block WebRTC outright (campus Wi-Fi, corporate LANs, most
 * guest networks, many mobile hotspots).
 *
 * Trade-off: messages take a detour through the broker, so it is slower than a
 * direct WebRTC channel. That is why click arbitration uses synchronized
 * timestamps rather than arrival order — see clock.js. Without that, the host
 * (whose own clicks are instant) would win nearly every round.
 *
 * Topic layout for code ABCD:
 *   among-us-dobble/v1/ABCD/presence   retained; "a host is waiting here"
 *   among-us-dobble/v1/ABCD/to-host    guest -> host
 *   among-us-dobble/v1/ABCD/to-guest   host -> guest
 */

import mqtt from 'mqtt'
import {
  CLAIM_TIMEOUT_MS,
  CLAIM_CHECK_MS,
  PRESENCE_WAIT_MS,
  RELAY_CONNECT_MS,
  RELAY_URLS,
  topics,
} from '../netconfig.js'

export const CODE_TAKEN = 'CODE_TAKEN'
export const NO_HOST = 'NO_HOST'
export const NO_BROKER = 'NO_BROKER'

const randomId = () => Math.random().toString(36).slice(2, 10)

/** Try each broker in turn; resolve with the first that connects. */
function connectAnyBroker(onStatus) {
  const urls = RELAY_URLS
  let index = 0

  return new Promise((resolve, reject) => {
    // Overall budget across all brokers, so a slow list cannot stall the game.
    const overall = setTimeout(
      () => reject(Object.assign(new Error('Relay timed out'), { code: NO_BROKER })),
      CLAIM_TIMEOUT_MS
    )
    const settle = (fn) => (arg) => {
      clearTimeout(overall)
      fn(arg)
    }
    resolve = settle(resolve)
    reject = settle(reject)

    const tryNext = () => {
      if (index >= urls.length) {
        reject(Object.assign(new Error('No relay broker reachable'), { code: NO_BROKER }))
        return
      }
      const url = urls[index++]
      onStatus?.(`Contacting relay ${index}/${urls.length}…`)

      let settled = false
      const client = mqtt.connect(url, {
        clientId: `aud-${randomId()}${randomId()}`,
        clean: true,
        reconnectPeriod: 0, // a dropped socket is a real disconnect, not a retry
        connectTimeout: RELAY_CONNECT_MS,
        keepalive: 30,
      })

      const giveUp = () => {
        if (settled) return
        settled = true
        try {
          client.end(true)
        } catch {
          /* ignore */
        }
        tryNext()
      }

      const timer = setTimeout(giveUp, RELAY_CONNECT_MS)

      client.once('connect', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        client.removeListener('error', giveUp)
        resolve(client)
      })
      client.once('error', giveUp)
      client.once('close', giveUp)
    }

    tryNext()
  })
}

/**
 * Wrap a connected client into the channel shape the game speaks.
 * `sid` keeps two different guests on the same code from crossing wires: every
 * message carries it, and anything with a different sid is ignored.
 */
function makeChannel({ client, code, role, sid, onSidSeen }) {
  const t = topics(code)
  const outTopic = role === 'host' ? t.toGuest : t.toHost

  let onData = null
  let onClose = null
  let closed = false
  let boundSid = role === 'guest' ? sid : null

  const handleMessage = (topic, payload) => {
    const inTopic = role === 'host' ? t.toHost : t.toGuest
    if (topic !== inTopic) return
    let msg
    try {
      msg = JSON.parse(payload.toString())
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object') return

    if (role === 'host') {
      if (boundSid === null) {
        boundSid = msg.sid
        onSidSeen?.(msg.sid)
      } else if (msg.sid !== boundSid) {
        return // a different guest on the same code — not ours
      }
    } else if (msg.sid !== boundSid) {
      return
    }

    const { sid: _ignored, ...body } = msg
    onData?.(body)
  }

  const handleClose = () => {
    if (closed) return
    closed = true
    onClose?.()
  }

  client.on('message', handleMessage)
  client.on('close', handleClose)
  client.on('error', handleClose)

  return {
    kind: 'relay',
    get open() {
      return !closed && client.connected
    },
    send(obj) {
      if (closed || !client.connected) return false
      try {
        client.publish(outTopic, JSON.stringify({ ...obj, sid: boundSid ?? sid }), { qos: 0 })
        return true
      } catch {
        return false
      }
    },
    setHandlers(handlers) {
      onData = handlers.onData
      onClose = handlers.onClose
    },
    /** Re-deliver a message to whatever handler is installed right now.
     *  Used when a channel is bound by its own first message. */
    emit(msg) {
      onData?.(msg)
    },
    close() {
      if (closed) return
      closed = true
      try {
        if (role === 'host') {
          // Clear the retained presence so the code stops advertising itself.
          client.publish(t.presence, '', { retain: true, qos: 0 })
        }
      } catch {
        /* ignore */
      }
      // Close gracefully so the LEAVE message and the presence clear actually
      // go out — a forced close drops them, which used to leave the other PC
      // stuck on a dead game.
      try {
        client.end(false)
        setTimeout(() => {
          try {
            client.end(true)
          } catch {
            /* ignore */
          }
        }, 600)
      } catch {
        /* ignore */
      }
    },
  }
}

/**
 * Claim a code on the relay and start advertising it.
 * Rejects with code CODE_TAKEN if another host is already using it.
 */
export async function relayClaimHost({ code, onStatus }) {
  const client = await connectAnyBroker(onStatus)
  const t = topics(code)

  // Is this code already advertised? A retained presence message arrives
  // immediately on subscribe if one exists.
  const taken = await new Promise((resolve) => {
    let done = false
    const finish = (value) => {
      if (done) return
      done = true
      client.removeListener('message', listener)
      resolve(value)
    }
    const listener = (topic, payload) => {
      if (topic === t.presence && payload && payload.length > 0) finish(true)
    }
    client.on('message', listener)
    client.subscribe(t.presence, { qos: 0 }, (err) => {
      if (err) finish(false)
    })
    setTimeout(() => finish(false), CLAIM_CHECK_MS)
  })

  if (taken) {
    try {
      client.end(true)
    } catch {
      /* ignore */
    }
    throw Object.assign(new Error('Code already in use'), { code: CODE_TAKEN })
  }

  await new Promise((resolve) => client.subscribe(t.toHost, { qos: 0 }, () => resolve()))
  client.publish(t.presence, JSON.stringify({ v: 1, ts: Date.now() }), { retain: true, qos: 0 })

  return makeChannel({ client, code, role: 'host', sid: null })
}

/**
 * Find a host advertising this code and open a channel to it.
 * Rejects with code NO_HOST if nothing is advertising the code.
 */
export async function relayJoin({ code, onStatus }) {
  const client = await connectAnyBroker(onStatus)
  const t = topics(code)

  onStatus?.('Looking for the game…')

  const found = await new Promise((resolve) => {
    let done = false
    const finish = (value) => {
      if (done) return
      done = true
      client.removeListener('message', listener)
      resolve(value)
    }
    const listener = (topic, payload) => {
      if (topic === t.presence) finish(!!payload && payload.length > 0)
    }
    client.on('message', listener)
    client.subscribe([t.presence, t.toGuest], { qos: 0 })
    setTimeout(() => finish(false), PRESENCE_WAIT_MS)
  })

  if (!found) {
    try {
      client.end(true)
    } catch {
      /* ignore */
    }
    throw Object.assign(new Error('No host advertising that code'), { code: NO_HOST })
  }

  return makeChannel({ client, code, role: 'guest', sid: randomId() })
}
