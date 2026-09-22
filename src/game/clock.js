/**
 * Clock synchronisation, so a slower connection is not a disadvantage.
 *
 * THE PROBLEM
 * The host's browser is the referee, and the host's own clicks reach that
 * referee instantly. The guest's clicks have to travel. Over a direct WebRTC
 * channel that is maybe 20ms and barely matters; over the relay it can be
 * 150ms or more, which in a game about who clicks first is the whole game.
 * Arbitrating by arrival order would mean the host wins almost every round.
 *
 * THE FIX
 * Estimate the offset between the two machines' clocks, exactly the way NTP
 * does, then have each player stamp their click with *when they clicked* in the
 * host's frame of reference. The host waits a short grace window, then awards
 * the round to the earliest stamp. Travel time stops mattering.
 *
 *   offset = hostTime - (guestSendTime + rtt/2)
 *
 * The sample with the smallest round trip is the most trustworthy — a sample
 * delayed by a queue or a GC pause has a big RTT and a bad estimate — so that
 * is the one kept.
 */

const SAMPLES = 7
const SAMPLE_GAP_MS = 120

export function createClockSync(send) {
  let offset = 0
  let bestRtt = Infinity
  let seq = 0
  const inflight = new Map()

  return {
    /** Best-effort offset from this machine's clock to the host's, in ms. */
    get offset() {
      return offset
    },
    /** Smallest observed round trip, used to size the arbitration window. */
    get rtt() {
      return bestRtt === Infinity ? 0 : bestRtt
    },
    /** Convert a local timestamp into the host's frame. */
    toHostTime(localMs = Date.now()) {
      return localMs + offset
    },

    /** Guest side: fire a burst of probes. */
    start() {
      for (let i = 0; i < SAMPLES; i++) {
        setTimeout(() => {
          const id = ++seq
          inflight.set(id, Date.now())
          send({ id })
        }, i * SAMPLE_GAP_MS)
      }
    },

    /** Guest side: handle the host's reply. */
    onPong({ id, hostTime }) {
      const sentAt = inflight.get(id)
      if (sentAt === undefined) return
      inflight.delete(id)

      const now = Date.now()
      const rtt = now - sentAt
      if (rtt < bestRtt) {
        bestRtt = rtt
        offset = hostTime - (sentAt + rtt / 2)
      }
    },

    reset() {
      offset = 0
      bestRtt = Infinity
      seq = 0
      inflight.clear()
    },
  }
}
