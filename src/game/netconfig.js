/**
 * Network configuration for the two ways the PCs can reach each other.
 *
 * Everything here can be overridden from a .env file — see .env.example.
 */

const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined

/* ------------------------------------------------------------------ WebRTC */

/**
 * ICE servers for the direct peer-to-peer path.
 *
 * PeerJS's built-in defaults are one Google STUN server plus TURN on UDP 3478.
 * That is exactly what campus, office and hotel networks block, and when it is
 * blocked the connection fails silently. So we replace them with a list that
 * degrades properly:
 *
 *   STUN                  — discovers the public address; enough on home Wi-Fi
 *   TURN over UDP 3478    — relays when the two NATs cannot be punched through
 *   TURN over TCP 80      — survives networks that drop UDP entirely
 *   TURNS over TLS 443    — looks like ordinary HTTPS, so it survives almost
 *                           any firewall that lets you browse the web at all
 *
 * These are free public servers, so they can be slow or busy. They are a
 * best-effort improvement, not the guarantee — the relay transport is the
 * guarantee.
 */
export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turns:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'],
    username: 'peerjs',
    credential: 'peerjsp',
  },
]

/** PeerJS broker options. Defaults to the free public broker. */
export const PEER_OPTIONS = (() => {
  const base = { debug: 0, config: { iceServers: ICE_SERVERS, sdpSemantics: 'unified-plan' } }
  const host = env?.VITE_PEER_HOST
  if (!host) return base
  return {
    ...base,
    host,
    port: Number(env.VITE_PEER_PORT || 443),
    path: env.VITE_PEER_PATH || '/',
    secure: String(env.VITE_PEER_SECURE ?? 'true') !== 'false',
  }
})()

/* ------------------------------------------------------------------- Relay */

/**
 * The relay path: a plain publish/subscribe message broker reached over
 * WebSocket Secure on 443.
 *
 * This needs NO hole punching, NO STUN, NO TURN and no UDP. If the browser can
 * load a web page, it can almost certainly reach this. It is slower than a
 * direct WebRTC channel (messages go via the broker), which is exactly why
 * click arbitration is done on synchronized timestamps rather than on arrival
 * order — see clock.js.
 *
 * These are free, open, shared brokers. No account, no key. They carry nothing
 * but this game's small JSON messages, under a topic derived from the game code.
 */
export const RELAY_URLS = env?.VITE_RELAY_URL
  ? [env.VITE_RELAY_URL]
  : [
      'wss://broker.emqx.io:8084/mqtt',
      'wss://broker.hivemq.com:8884/mqtt',
      'wss://test.mosquitto.org:8081/',
    ]

/** Topic namespace, so our codes cannot collide with anything else on a shared broker. */
export const RELAY_NS = 'among-us-dobble/v1'

export const topics = (code) => {
  const c = String(code).toUpperCase()
  return {
    presence: `${RELAY_NS}/${c}/presence`,
    toHost: `${RELAY_NS}/${c}/to-host`,
    toGuest: `${RELAY_NS}/${c}/to-guest`,
  }
}

/* ------------------------------------------------------------------ Timing */

/** How long a guest waits for a host to answer on either transport. */
export const JOIN_TIMEOUT_MS = 15000
/** How long to wait for a retained presence message before declaring "no such game". */
export const PRESENCE_WAIT_MS = 3000
/** How long a host waits when checking whether a candidate code is already taken. */
export const CLAIM_CHECK_MS = 900
/** Connection attempt budget per relay broker before trying the next one. */
export const RELAY_CONNECT_MS = 4500
/** Hard cap on claiming a code on one transport, so a dead service cannot
 *  stall game creation — the other transport just carries the game alone. */
export const CLAIM_TIMEOUT_MS = 9000
