import Stage from '../components/Stage.jsx'
import ChunkyButton from '../components/ChunkyButton.jsx'
import { useGame } from '../game/GameProvider.jsx'
import bg from '../assets/screens/home.jpg'

const ASPECT = 1535 / 1024

/** Home Page — Create Code / Join Code. */
export default function HomePage() {
  const { goCreateCode, goJoinCodePage, status, error, notice } = useGame()
  const busy = status === 'creating'

  return (
    <Stage bg={bg} aspect={ASPECT}>
      {(error || notice) && (
        <div className="absolute left-1/2 top-[4cqh] z-30 w-[70cqw] -translate-x-1/2 animate-popIn">
          <div
            className={[
              'rounded-[1.2cqw] border-[0.3cqw] px-[2.5cqw] py-[1.6cqh] text-center',
              'text-[1.7cqw] font-bold tracking-wide',
              error
                ? 'border-[#7A0838] bg-[#C51111]/95 text-white'
                : 'border-[#0C2C74] bg-[#1F5FD0]/95 text-white',
            ].join(' ')}
          >
            {error || notice}
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-[10cqh] z-20 flex items-center justify-center gap-[4cqw]">
        <ChunkyButton tone="red" onClick={goCreateCode} disabled={busy}>
          {busy ? 'Creating…' : 'Create Code'}
        </ChunkyButton>
        <ChunkyButton tone="blue" onClick={goJoinCodePage} disabled={busy}>
          Join Code
        </ChunkyButton>
      </div>

      <p className="pointer-events-none absolute inset-x-0 bottom-[3.5cqh] text-center text-[1.15cqw] font-semibold tracking-wide text-white/55">
        9 rounds · first to spot the matching symbol wins the round
      </p>
    </Stage>
  )
}
