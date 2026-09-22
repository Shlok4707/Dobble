/**
 * The wire protocol between the two PCs.
 *
 * There is no server, so the HOST's browser plays the server role: it owns the
 * deck, the round number, the scores and the answer, and it is the only side
 * allowed to decide anything. The GUEST renders what it is told and sends
 * clicks. That keeps the spec's golden rule intact — "never trust client data"
 * — as far as it can be kept in a peer-to-peer game.
 *
 * Note that MATCH IDs ARE NEVER SENT TO THE GUEST while a round is live. The
 * guest literally does not have the answer in memory until the round is over.
 */

export const PROTOCOL_VERSION = 1

/** Peer id namespace, so our 4-char codes can't collide with other PeerJS apps. */
export const PEER_PREFIX = 'amongus-dobble-v1-'

export const peerIdFor = (code) => PEER_PREFIX + code.toUpperCase()

export const MSG = {
  /** guest -> host: "I'd like to join" */
  HELLO: 'HELLO',
  /** host -> guest: "you're in" */
  WELCOME: 'WELCOME',
  /** host -> guest: "you're not" (+ reason) */
  REJECT: 'REJECT',
  /** host -> guest: countdown tick (3, 2, 1, START) */
  COUNTDOWN: 'COUNTDOWN',
  /** host -> guest: full authoritative snapshot */
  STATE: 'STATE',
  /** guest -> host: "I clicked symbol N in round R" */
  CLICK: 'CLICK',
  /** host -> guest: result of a click that did not end the round */
  FEEDBACK: 'FEEDBACK',
  /** either -> either: "I pressed Back / I'm leaving" */
  LEAVE: 'LEAVE',
  /** guest -> host: clock-sync probe */
  PING: 'PING',
  /** host -> guest: clock-sync reply, carrying the host's clock */
  PONG: 'PONG',
  /** guest -> host: "my clock is synced, my round trip is N ms" */
  SYNC: 'SYNC',
}

export const REJECT_REASON = {
  FULL: 'FULL',
  IN_PROGRESS: 'IN_PROGRESS',
  VERSION: 'VERSION',
}

export const PHASE = {
  LOBBY: 'LOBBY',
  COUNTDOWN: 'COUNTDOWN',
  PLAYING: 'PLAYING',
  ROUND_END: 'ROUND_END',
  GAME_OVER: 'GAME_OVER',
}

/** Exact screen names from the game flow. */
export const SCREEN = {
  HOME: 'Home Page',
  CODE_CREATED: 'Code Created Page',
  JOIN_CODE: 'Join Code Page',
  TIMER: 'Game Start Timer Page',
  GAME: 'Game BG Page',
  WINNER: 'Winner Page',
  LOST: 'Lost Page',
  DRAW: 'Draw Page',
}

export const ROLE = { HOST: 'host', GUEST: 'guest' }

/** 4-character codes. I, O, 0 and 1 are excluded so codes can be read aloud. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 4

export function generateCode() {
  let out = ''
  const bytes = new Uint32Array(CODE_LENGTH)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
    for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  } else {
    for (let i = 0; i < CODE_LENGTH; i++) {
      out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    }
  }
  return out
}

export function normaliseCode(input) {
  return (input || '')
    .toUpperCase()
    .split('')
    .filter((c) => CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, CODE_LENGTH)
}

export function isValidCodeFormat(code) {
  return typeof code === 'string' && code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c))
}
