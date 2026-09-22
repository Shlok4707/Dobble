/**
 * Multiplayer Logic + Room Logic + State Machine  —  spec sections 9, 11, 17.
 *
 * There is no backend, so the host's browser plays the server role for every
 * decision: deck, rounds, scores, match validation, round progression and the
 * final result. The guest renders what it is told and sends clicks.
 *
 * How the two PCs find each other is deliberately not this file's problem —
 * see transport/, which opens a direct WebRTC channel and a relay channel at
 * the same time and keeps whichever one the network actually allows.
 *
 * Two things here are worth understanding:
 *
 *  1. THE ANSWER IS NEVER SENT TO THE GUEST while a round is live. The snapshot
 *     carries matchId: null until somebody wins the round.
 *
 *  2. ROUNDS ARE WON ON TIMESTAMPS, NOT ARRIVAL ORDER. The host's own clicks
 *     reach the referee instantly while the guest's have to travel, so judging
 *     by arrival would hand the host nearly every round — badly so over the
 *     relay. Instead both players stamp their click in a shared time frame
 *     (see clock.js), the host waits a short window, and the earliest stamp
 *     wins. Travel time stops mattering.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import {
  MSG,
  PHASE,
  PROTOCOL_VERSION,
  REJECT_REASON,
  ROLE,
  SCREEN,
  isValidCodeFormat,
} from './protocol.js'
import {
  RESULT,
  TOTAL_ROUNDS,
  advanceRound,
  createGame,
  inspectClick,
  resultFor,
  snapshotFor,
  submitClick,
} from './engine.js'
import { openHost, joinGame, describeJoinFailure } from './transport/index.js'
import { createClockSync } from './clock.js'
import { sfx, unlockAudio } from './sound.js'

/** How long the winning symbol stays highlighted before the next round. */
const ROUND_END_MS = 1700
/** Pause between "START!" and the first card. */
const START_DELAY_MS = 700
/** Longest the host will wait for the guest's clock sync before starting anyway. */
const SYNC_WAIT_MS = 2200

/** Arbitration window bounds — see the note at the top of this file. */
const MIN_ARBITRATION_MS = 140
const MAX_ARBITRATION_MS = 450

const GameContext = createContext(null)

export function useGame() {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used inside <GameProvider>')
  return ctx
}

const emptySnapshot = {
  phase: PHASE.LOBBY,
  round: 0,
  totalRounds: TOTAL_ROUNDS,
  scores: { [ROLE.HOST]: 0, [ROLE.GUEST]: 0 },
  roundWinner: null,
  layoutA: [],
  layoutB: [],
  matchId: null,
}

export function GameProvider({ children }) {
  const [screen, setScreen] = useState(SCREEN.HOME)
  const [role, setRole] = useState(null)
  const [code, setCode] = useState('')
  const [snapshot, setSnapshot] = useState(emptySnapshot)
  const [countdown, setCountdown] = useState(null)
  const [status, setStatus] = useState('idle') // idle | creating | waiting | joining | connected
  const [statusText, setStatusText] = useState('')
  const [connection, setConnection] = useState({ via: null, rtt: null })
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [feedback, setFeedback] = useState(null)

  const hostHandleRef = useRef(null) // the listening host (both transports)
  const channelRef = useRef(null) // the one live channel
  const gameRef = useRef(null)
  const roleRef = useRef(null)
  const clockRef = useRef(null)
  const rttRef = useRef(0)
  const pendingRef = useRef(null) // buffered correct clicks during arbitration
  const timersRef = useRef([])

  const setRoleBoth = (r) => {
    roleRef.current = r
    setRole(r)
  }

  // ---------------------------------------------------------------- helpers

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  const later = useCallback((fn, ms) => {
    const id = setTimeout(fn, ms)
    timersRef.current.push(id)
    return id
  }, [])

  const send = useCallback((payload) => {
    const ch = channelRef.current
    if (!ch) return false
    return ch.send(payload)
  }, [])

  const teardown = useCallback(
    (opts = {}) => {
      clearTimers()
      pendingRef.current = null

      const channel = channelRef.current
      const hostHandle = hostHandleRef.current
      channelRef.current = null
      hostHandleRef.current = null

      try {
        if (opts.announce) channel?.send({ t: MSG.LEAVE })
      } catch {
        /* ignore */
      }

      // Let "I'm leaving" actually reach the other PC before pulling the
      // socket down, otherwise they sit on a game that has already ended.
      const closeAll = () => {
        try {
          channel?.close()
        } catch {
          /* ignore */
        }
        try {
          hostHandle?.close()
        } catch {
          /* ignore */
        }
      }
      if (opts.announce && channel) setTimeout(closeAll, 250)
      else closeAll()
      gameRef.current = null
      roleRef.current = null
      clockRef.current = null
      rttRef.current = 0

      setRole(null)
      setCode('')
      setSnapshot(emptySnapshot)
      setCountdown(null)
      setFeedback(null)
      setStatus('idle')
      setStatusText('')
      setConnection({ via: null, rtt: null })
      setScreen(SCREEN.HOME)
    },
    [clearTimers, send]
  )

  const applySnapshot = useCallback((snap, myRole) => {
    setSnapshot(snap)
    if (snap.phase === PHASE.PLAYING || snap.phase === PHASE.ROUND_END) {
      setScreen(SCREEN.GAME)
    } else if (snap.phase === PHASE.GAME_OVER) {
      const outcome = resultFor(snap.scores, myRole)
      if (outcome === RESULT.WIN) {
        setScreen(SCREEN.WINNER)
        sfx.win()
      } else if (outcome === RESULT.LOSE) {
        setScreen(SCREEN.LOST)
        sfx.lose()
      } else {
        setScreen(SCREEN.DRAW)
        sfx.draw()
      }
    }
  }, [])

  // ------------------------------------------------------------- host logic

  const broadcast = useCallback(
    (game) => {
      const snap = snapshotFor(game)
      send({ t: MSG.STATE, snap })
      applySnapshot(snap, ROLE.HOST)
    },
    [send, applySnapshot]
  )

  const startCountdown = useCallback(() => {
    setScreen(SCREEN.TIMER)

    const steps = [3, 2, 1, 'START']
    steps.forEach((value, i) => {
      later(() => {
        setCountdown(value)
        send({ t: MSG.COUNTDOWN, value })
        if (value === 'START') sfx.start()
        else sfx.tick()
      }, i * 1000)
    })

    later(() => {
      const game = { ...gameRef.current, phase: PHASE.PLAYING }
      gameRef.current = game
      setCountdown(null)
      broadcast(game)
    }, steps.length * 1000 + START_DELAY_MS)
  }, [later, send, broadcast])

  const finishRound = useCallback(() => {
    const game = advanceRound(gameRef.current)
    gameRef.current = game
    broadcast(game)
  }, [broadcast])

  /**
   * Close the arbitration window: award the round to the earliest timestamp.
   */
  const resolveRound = useCallback(() => {
    const pending = pendingRef.current
    pendingRef.current = null
    if (!pending) return

    const { role: winner, symbolId } = pending.best
    const res = submitClick(gameRef.current, winner, symbolId, gameRef.current.round)
    if (!res.correct) return

    gameRef.current = res.game

    if (winner === roleRef.current) {
      setFeedback({ kind: 'correct', symbolId, at: Date.now() })
      sfx.correct()
    } else {
      sfx.lostRound()
    }

    broadcast(res.game)
    later(finishRound, ROUND_END_MS)
  }, [broadcast, later, finishRound])

  /**
   * Every click from EITHER player funnels through here, on the host.
   * `stamp` is the moment of the click expressed in the host's clock.
   */
  const handleClick = useCallback(
    (clickRole, symbolId, round, stamp) => {
      const game = gameRef.current
      if (!game) return

      const verdict = inspectClick(game, clickRole, symbolId, round)

      if (!verdict.accepted) {
        if (clickRole === ROLE.GUEST) {
          send({ t: MSG.FEEDBACK, accepted: false, correct: false, symbolId, reason: verdict.reason })
        } else {
          setFeedback({ kind: 'reject', symbolId, at: Date.now() })
          sfx.reject()
        }
        return
      }

      if (!verdict.correct) {
        // Wrong answer: commit it straight away so the spam and double-click
        // guards advance, and tell that player.
        gameRef.current = submitClick(game, clickRole, symbolId, round).game
        if (clickRole === ROLE.GUEST) {
          send({ t: MSG.FEEDBACK, accepted: true, correct: false, symbolId })
        } else {
          setFeedback({ kind: 'wrong', symbolId, at: Date.now() })
          sfx.wrong()
        }
        return
      }

      // Correct answer. Do NOT award it yet — the other player may have clicked
      // earlier and their message may still be in flight.
      const ts = Number.isFinite(stamp) ? stamp : Date.now()
      const pending = pendingRef.current

      if (!pending) {
        pendingRef.current = { best: { role: clickRole, symbolId, ts } }
        const window = Math.min(MAX_ARBITRATION_MS, Math.max(MIN_ARBITRATION_MS, rttRef.current + 40))
        later(resolveRound, window)
      } else if (ts < pending.best.ts) {
        pending.best = { role: clickRole, symbolId, ts }
      }
    },
    [send, later, resolveRound]
  )

  /** Attach the game protocol to a freshly bound channel, host side. */
  const attachHostChannel = useCallback(
    (channel) => {
      channelRef.current = channel
      let started = false

      const beginGame = () => {
        if (started) return
        started = true
        gameRef.current = createGame()
        startCountdown()
      }

      channel.setHandlers({
        onData: (msg) => {
          if (!msg || typeof msg !== 'object') return

          switch (msg.t) {
            case MSG.HELLO: {
              if (msg.version !== PROTOCOL_VERSION) {
                channel.send({ t: MSG.REJECT, reason: REJECT_REASON.VERSION })
                later(() => channel.close(), 250)
                return
              }
              setStatus('connected')
              setConnection({ via: channel.kind, rtt: null })
              channel.send({ t: MSG.WELCOME, totalRounds: TOTAL_ROUNDS })
              sfx.join()
              // Give the guest a moment to measure the link, then start.
              later(beginGame, SYNC_WAIT_MS)
              return
            }

            case MSG.PING: {
              channel.send({ t: MSG.PONG, id: msg.id, hostTime: Date.now() })
              return
            }

            case MSG.SYNC: {
              rttRef.current = Number.isFinite(msg.rtt) ? msg.rtt : 0
              setConnection({ via: channel.kind, rtt: rttRef.current })
              beginGame()
              return
            }

            case MSG.CLICK: {
              handleClick(ROLE.GUEST, msg.symbolId, msg.round, msg.stamp)
              return
            }

            case MSG.LEAVE: {
              sfx.disconnect()
              setNotice('The other player left the game.')
              teardown()
              return
            }

            default:
              return
          }
        },
        onClose: () => {
          if (gameRef.current) {
            sfx.disconnect()
            setNotice('The other player disconnected.')
          }
          teardown()
        },
      })
    },
    [later, startCountdown, handleClick, teardown]
  )

  // ------------------------------------------------------------ guest logic

  const attachGuestChannel = useCallback(
    (channel) => {
      channelRef.current = channel

      const clock = createClockSync((payload) => channel.send({ t: MSG.PING, ...payload }))
      clockRef.current = clock

      channel.setHandlers({
        onData: (msg) => {
          if (!msg || typeof msg !== 'object') return

          switch (msg.t) {
            case MSG.WELCOME: {
              setStatus('connected')
              setConnection({ via: channel.kind, rtt: null })
              setScreen(SCREEN.TIMER)
              sfx.join()
              clock.start()
              // Report the measured link quality so the host can size its
              // arbitration window, then the game begins.
              later(() => {
                rttRef.current = clock.rtt
                setConnection({ via: channel.kind, rtt: clock.rtt })
                channel.send({ t: MSG.SYNC, rtt: clock.rtt })
              }, 1100)
              return
            }

            case MSG.PONG: {
              clock.onPong(msg)
              return
            }

            case MSG.REJECT: {
              const text =
                msg.reason === REJECT_REASON.IN_PROGRESS
                  ? 'That game has already started.'
                  : msg.reason === REJECT_REASON.VERSION
                    ? 'The other player is running a different version of the game.'
                    : 'That game is already full.'
              setError(text)
              teardown()
              setScreen(SCREEN.JOIN_CODE)
              return
            }

            case MSG.COUNTDOWN: {
              setScreen(SCREEN.TIMER)
              setCountdown(msg.value)
              if (msg.value === 'START') sfx.start()
              else sfx.tick()
              return
            }

            case MSG.STATE: {
              setCountdown(null)
              applySnapshot(msg.snap, ROLE.GUEST)
              return
            }

            case MSG.FEEDBACK: {
              if (!msg.accepted) {
                setFeedback({ kind: 'reject', symbolId: msg.symbolId, at: Date.now() })
                sfx.reject()
              } else if (!msg.correct) {
                setFeedback({ kind: 'wrong', symbolId: msg.symbolId, at: Date.now() })
                sfx.wrong()
              }
              return
            }

            case MSG.LEAVE: {
              sfx.disconnect()
              setNotice('The other player left the game.')
              teardown()
              return
            }

            default:
              return
          }
        },
        onClose: () => {
          if (gameRef.current || channelRef.current) {
            sfx.disconnect()
            setNotice('Lost connection to the other player.')
          }
          teardown()
        },
      })
    },
    [applySnapshot, later, teardown]
  )

  // -------------------------------------------------------- public actions

  const goCreateCode = useCallback(async () => {
    unlockAudio()
    sfx.click()
    setError(null)
    setNotice(null)
    clearTimers()
    setRoleBoth(ROLE.HOST)
    setStatus('creating')
    setStatusText('Opening a game…')

    try {
      const handle = await openHost({
        onStatus: setStatusText,
        onGuest: attachHostChannel,
      })
      hostHandleRef.current = handle
      setCode(handle.code)
      setStatus('waiting')
      setStatusText('')
      setConnection({ via: handle.transports.join('+'), rtt: null })
      setScreen(SCREEN.CODE_CREATED)
    } catch {
      setError('Could not reach the internet services this game needs. Check your connection.')
      setStatus('idle')
      setStatusText('')
      setScreen(SCREEN.HOME)
    }
  }, [clearTimers, attachHostChannel])

  const goJoinCodePage = useCallback(() => {
    unlockAudio()
    sfx.click()
    setError(null)
    setNotice(null)
    setScreen(SCREEN.JOIN_CODE)
  }, [])

  const joinWithCode = useCallback(
    async (input) => {
      unlockAudio()
      sfx.click()
      const candidate = (input || '').toUpperCase()

      if (!isValidCodeFormat(candidate)) {
        setError('Enter the full 4-character code.')
        return
      }

      setError(null)
      setNotice(null)
      setRoleBoth(ROLE.GUEST)
      setStatus('joining')
      setStatusText('Connecting…')
      setCode(candidate)

      try {
        const { channel } = await joinGame({ code: candidate, onStatus: setStatusText })
        setStatusText('')
        attachGuestChannel(channel)
        channel.send({ t: MSG.HELLO, version: PROTOCOL_VERSION })
      } catch (err) {
        setError(describeJoinFailure(err?.reasons))
        teardown()
        setScreen(SCREEN.JOIN_CODE)
      }
    },
    [attachGuestChannel, teardown]
  )

  const goHome = useCallback(() => {
    sfx.click()
    setError(null)
    setNotice(null)
    teardown({ announce: true })
  }, [teardown])

  /** A player clicked a symbol on a card. */
  const clickSymbol = useCallback(
    (symbolId) => {
      const myRole = roleRef.current
      if (!myRole) return

      if (myRole === ROLE.HOST) {
        handleClick(ROLE.HOST, symbolId, gameRef.current?.round ?? 0, Date.now())
      } else {
        // Stamp the click in the HOST's clock so a slow link costs nothing.
        const stamp = clockRef.current ? clockRef.current.toHostTime() : Date.now()
        send({ t: MSG.CLICK, symbolId, round: snapshot.round, stamp })
      }
    },
    [handleClick, send, snapshot.round]
  )

  const clickedNothing = useCallback(() => {
    sfx.reject()
  }, [])

  useEffect(() => {
    const onUnload = () => {
      try {
        channelRef.current?.send({ t: MSG.LEAVE })
        channelRef.current?.close()
        hostHandleRef.current?.close()
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      onUnload()
    }
  }, [])

  const myScore = role ? snapshot.scores[role] : 0
  const opponentScore = role ? snapshot.scores[role === ROLE.HOST ? ROLE.GUEST : ROLE.HOST] : 0

  const value = useMemo(
    () => ({
      screen,
      role,
      code,
      snapshot,
      countdown,
      status,
      statusText,
      connection,
      error,
      notice,
      feedback,
      myScore,
      opponentScore,
      totalRounds: snapshot.totalRounds,
      goCreateCode,
      goJoinCodePage,
      joinWithCode,
      goHome,
      clickSymbol,
      clickedNothing,
      clearError: () => setError(null),
      clearNotice: () => setNotice(null),
    }),
    [
      screen,
      role,
      code,
      snapshot,
      countdown,
      status,
      statusText,
      connection,
      error,
      notice,
      feedback,
      myScore,
      opponentScore,
      goCreateCode,
      goJoinCodePage,
      joinWithCode,
      goHome,
      clickSymbol,
      clickedNothing,
    ]
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}
