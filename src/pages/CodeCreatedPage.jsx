import { useState } from 'react'
import Stage from '../components/Stage.jsx'
import BackButton from '../components/BackButton.jsx'
import { useGame } from '../game/GameProvider.jsx'
import { sfx } from '../game/sound.js'
import bg from '../assets/screens/code-created.jpg'

const ASPECT = 1536 / 865

/**
 * Code Created Page.
 * The code stays live — the peer is registered under it — for as long as this
 * screen is open. Pressing Back destroys the peer and releases the code.
 */
export default function CodeCreatedPage() {
  const { code, connection } = useGame()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      sfx.click()
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked — the code is on screen anyway */
    }
  }

  return (
    <Stage bg={bg} aspect={ASPECT}>
      <div className="absolute left-1/2 top-[47cqh] z-20 -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="flex items-center justify-center gap-[1.4cqw]">
          {(code || '····').split('').map((char, i) => (
            <span
              key={i}
              className="flex h-[13cqh] w-[8.5cqw] animate-popIn items-center justify-center
                         rounded-[1.2cqw] border-[0.35cqw] border-[#9AD9F5]/70 bg-[#0B1B36]/85
                         text-[6cqw] font-black text-[#9AD9F5]"
              style={{
                animationDelay: `${i * 55}ms`,
                textShadow: '0 0 2cqw rgba(154,217,245,0.75)',
                boxShadow: 'inset 0 0 2cqw rgba(154,217,245,0.18)',
              }}
            >
              {char}
            </span>
          ))}
        </div>

        {connection.via && (
          <p className="mt-[2cqh] text-[1.05cqw] font-bold uppercase tracking-[0.2em] text-white/45">
            {connection.via.includes('+')
              ? 'Reachable by direct connection and relay'
              : connection.via === 'relay'
                ? 'Reachable by relay'
                : 'Reachable by direct connection'}
          </p>
        )}

        <button
          type="button"
          onClick={copy}
          disabled={!code}
          className="mt-[2.5cqh] rounded-[1cqw] border-[0.25cqw] border-white/25 bg-white/10
                     px-[2.4cqw] py-[1.1cqh] text-[1.4cqw] font-bold uppercase tracking-[0.15em]
                     text-white/80 transition hover:bg-white/20 disabled:opacity-40"
        >
          {copied ? 'Copied!' : 'Copy code'}
        </button>
      </div>

      <BackButton />
    </Stage>
  )
}
