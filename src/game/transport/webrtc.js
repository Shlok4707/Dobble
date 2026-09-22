/**
 * Direct WebRTC transport, via PeerJS.
 *
 * This is the fast path: once connected, the two browsers talk straight to
 * each other and nothing passes through any server. It is tried first, but it
 * is not relied on, because establishing it requires punching through both
 * networks' NATs — which plenty of real-world networks simply do not allow.
 *
 * The PeerJS broker here is used only for introductions; see netconfig.js for
 * the ICE server list that does the actual traversal.
 */

import Peer from 'peerjs'
import { CLAIM_TIMEOUT_MS, PEER_OPTIONS } from '../netconfig.js'
import { peerIdFor } from '../protocol.js'

export const CODE_TAKEN = 'CODE_TAKEN'
export const NO_HOST = 'NO_HOST'
export const NO_BROKER = 'NO_BROKER'
export const BLOCKED = 'BLOCKED'

/** How long to wait for the data channel to actually open once the host is found. */
const CHANNEL_OPEN_MS = 9000

function wrapConnection(peer, conn) {
  let onData = null
  let onClose = null
  let closed = false

  const handleClose = () => {
    if (closed) return
    closed = true
    onClose?.()
  }

  conn.on('data', (msg) => {
    if (msg && typeof msg === 'object') onData?.(msg)
  })
  conn.on('close', handleClose)
  conn.on('error', handleClose)

  return {
    kind: 'webrtc',
    get open() {
      return !closed && conn.open
    },
    send(obj) {
      if (closed || !conn.open) return false
      try {
        conn.send(obj)
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
        conn.close()
      } catch {
        /* ignore */
      }
      try {
        peer.destroy()
      } catch {
        /* ignore */
      }
    },
  }
}

/**
 * Register this code on the PeerJS broker and wait for a guest.
 * Rejects with code CODE_TAKEN if the id is already registered anywhere.
 *
 * Resolves as soon as the id is registered — `onGuest` fires later, if and
 * when a guest actually arrives on this transport.
 */
export function webrtcClaimHost({ code, onStatus, onGuest }) {
  return new Promise((resolve, reject) => {
    let settled = false
    const peer = new Peer(peerIdFor(code), PEER_OPTIONS)

    onStatus?.('Registering with the matchmaking service…')

    // A broker that never answers must not hold up the whole game: time out and
    // let the relay carry it alone.
    const deadline = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        peer.destroy()
      } catch {
        /* ignore */
      }
      reject(
        Object.assign(new Error('Matchmaking service timed out'), { code: NO_BROKER, type: 'timeout' })
      )
    }, CLAIM_TIMEOUT_MS)

    peer.on('open', () => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      resolve({
        peer,
        close() {
          try {
            peer.destroy()
          } catch {
            /* ignore */
          }
        },
      })
    })

    peer.on('connection', (conn) => {
      conn.on('open', () => onGuest?.(wrapConnection(peer, conn)))
    })

    peer.on('error', (err) => {
      const type = err?.type
      if (type === 'peer-unavailable') return // a stale dial at us; harmless

      if (settled) return
      settled = true
      clearTimeout(deadline)
      try {
        peer.destroy()
      } catch {
        /* ignore */
      }

      if (type === 'unavailable-id') {
        reject(Object.assign(new Error('Code already registered'), { code: CODE_TAKEN }))
      } else {
        reject(
          Object.assign(new Error(`PeerJS broker unreachable (${type || 'unknown'})`), {
            code: NO_BROKER,
            type,
          })
        )
      }
    })
  })
}

/**
 * Dial a host by code.
 *
 * Two distinct failures matter here and used to be conflated:
 *   NO_HOST  — the broker has never heard of this code
 *   BLOCKED  — the host exists, but the peer-to-peer channel never opened,
 *              which means the network is blocking WebRTC
 */
export function webrtcJoin({ code, onStatus }) {
  return new Promise((resolve, reject) => {
    let settled = false
    const peer = new Peer(PEER_OPTIONS)

    const fail = (err) => {
      if (settled) return
      settled = true
      try {
        peer.destroy()
      } catch {
        /* ignore */
      }
      reject(err)
    }

    onStatus?.('Trying a direct connection…')

    peer.on('open', () => {
      const conn = peer.connect(peerIdFor(code), { reliable: true })

      const timer = setTimeout(
        () =>
          fail(
            Object.assign(new Error('Direct connection blocked'), {
              code: BLOCKED,
            })
          ),
        CHANNEL_OPEN_MS
      )

      conn.on('open', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(wrapConnection(peer, conn))
      })

      conn.on('error', () => {
        clearTimeout(timer)
        fail(Object.assign(new Error('Direct connection failed'), { code: BLOCKED }))
      })
    })

    peer.on('error', (err) => {
      const type = err?.type
      if (type === 'peer-unavailable') {
        fail(Object.assign(new Error('No such game'), { code: NO_HOST }))
      } else if (type === 'network' || type === 'server-error' || type === 'socket-error') {
        fail(
          Object.assign(new Error('Matchmaking service unreachable'), { code: NO_BROKER, type })
        )
      } else {
        fail(Object.assign(new Error(`WebRTC error (${type || 'unknown'})`), { code: BLOCKED, type }))
      }
    })
  })
}
