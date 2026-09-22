/**
 * Sound Logic — spec section 16, synthesised with the Web Audio API.
 *
 * No .mp3 files, nothing to preload, nothing to 404. Every cue is generated
 * from oscillators at call time, so the whole soundtrack costs zero bytes.
 *
 * Browsers refuse to start an AudioContext before a user gesture, so the
 * context is created lazily on the first click and resumed if suspended.
 */

let ctx = null
let master = null
let muted = false

function ensureContext() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.35
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

/** Call once from the first user interaction so later cues are instant. */
export function unlockAudio() {
  ensureContext()
}

export function setMuted(value) {
  muted = value
  if (master) master.gain.value = value ? 0 : 0.35
}

export function isMuted() {
  return muted
}

export function toggleMuted() {
  setMuted(!muted)
  return muted
}

/**
 * One note.
 * @param {object} o
 * @param {number} o.freq      start frequency (Hz)
 * @param {number} [o.endFreq] glide target
 * @param {number} o.start     delay from now (s)
 * @param {number} o.dur       duration (s)
 * @param {OscillatorType} [o.type]
 * @param {number} [o.gain]
 */
function note({ freq, endFreq, start = 0, dur = 0.15, type = 'triangle', gain = 0.6 }) {
  const ac = ensureContext()
  if (!ac || muted) return

  const t0 = ac.currentTime + start
  const osc = ac.createOscillator()
  const env = ac.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (endFreq && endFreq !== freq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur)
  }

  // Quick attack, smooth decay — avoids clicks at note boundaries.
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  osc.connect(env)
  env.connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/** Filtered white noise — used for the "wrong" buzz texture. */
function noise({ start = 0, dur = 0.18, gain = 0.25, freq = 900 }) {
  const ac = ensureContext()
  if (!ac || muted) return

  const t0 = ac.currentTime + start
  const frames = Math.floor(ac.sampleRate * dur)
  const buffer = ac.createBuffer(1, frames, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1

  const src = ac.createBufferSource()
  src.buffer = buffer

  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = freq

  const env = ac.createGain()
  env.gain.setValueAtTime(gain, t0)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  src.connect(filter)
  filter.connect(env)
  env.connect(master)
  src.start(t0)
}

export const sfx = {
  /** UI button press */
  click() {
    note({ freq: 880, endFreq: 1200, dur: 0.07, type: 'square', gain: 0.25 })
  },

  /** Countdown tick: 3, 2, 1 */
  tick() {
    note({ freq: 520, dur: 0.12, type: 'square', gain: 0.4 })
    note({ freq: 260, dur: 0.14, type: 'sine', gain: 0.3 })
  },

  /** Countdown "START!" */
  start() {
    note({ freq: 523, start: 0.0, dur: 0.14, type: 'triangle' })
    note({ freq: 784, start: 0.1, dur: 0.14, type: 'triangle' })
    note({ freq: 1047, start: 0.2, dur: 0.3, type: 'triangle' })
  },

  /** Player found the match */
  correct() {
    note({ freq: 659, start: 0.0, dur: 0.11 })
    note({ freq: 880, start: 0.08, dur: 0.11 })
    note({ freq: 1319, start: 0.16, dur: 0.26 })
  },

  /** Opponent found the match first */
  lostRound() {
    note({ freq: 392, start: 0.0, dur: 0.14, type: 'sine', gain: 0.45 })
    note({ freq: 294, start: 0.1, dur: 0.24, type: 'sine', gain: 0.45 })
  },

  /** Wrong symbol clicked */
  wrong() {
    note({ freq: 180, endFreq: 90, dur: 0.22, type: 'sawtooth', gain: 0.35 })
    noise({ dur: 0.16, gain: 0.18, freq: 700 })
  },

  /** A click that landed on nothing clickable, or was rejected */
  reject() {
    note({ freq: 220, dur: 0.07, type: 'square', gain: 0.18 })
  },

  /** Second player joined */
  join() {
    note({ freq: 587, start: 0, dur: 0.1 })
    note({ freq: 880, start: 0.09, dur: 0.18 })
  },

  /** Game over — you won */
  win() {
    const seq = [523, 659, 784, 1047, 1319]
    seq.forEach((f, i) => note({ freq: f, start: i * 0.11, dur: 0.22, type: 'triangle' }))
    note({ freq: 1047, start: 0.62, dur: 0.6, type: 'triangle', gain: 0.5 })
  },

  /** Game over — you lost */
  lose() {
    const seq = [440, 392, 330, 262]
    seq.forEach((f, i) => note({ freq: f, start: i * 0.16, dur: 0.3, type: 'sine', gain: 0.5 }))
  },

  /** Game over — draw */
  draw() {
    note({ freq: 523, start: 0, dur: 0.22, type: 'triangle' })
    note({ freq: 523, start: 0.24, dur: 0.34, type: 'triangle' })
  },

  /** Opponent left / connection lost */
  disconnect() {
    note({ freq: 330, endFreq: 110, dur: 0.5, type: 'sine', gain: 0.4 })
  },
}
