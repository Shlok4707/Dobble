import Stage from '../components/Stage.jsx'
import ChunkyButton from '../components/ChunkyButton.jsx'
import { useGame } from '../game/GameProvider.jsx'
import bg from '../assets/screens/timer.jpg'

const ASPECT = 16 / 9

/**
 * Draw Page — "If the scores are equal: handle as Draw/Tie".
 * Not one of the seven named screens, so it borrows the neutral ship interior
 * rather than the winner or loser artwork.
 */
export default function DrawPage() {
  const { myScore, totalRounds, goHome } = useGame()

  return (
    <Stage bg={bg} aspect={ASPECT}>
      <div className="pointer-events-none absolute left-1/2 top-[24cqh] z-20 -translate-x-1/2 text-center">
        <h1
          className="animate-popIn text-[7cqw] font-black uppercase tracking-[0.1em] text-[#F0A81C]"
          style={{ textShadow: '0 0 3cqw rgba(240,168,28,0.6), 0 0.6cqw 0 rgba(0,0,0,0.5)' }}
        >
          It&apos;s a Draw
        </h1>
        <p className="mt-[1cqh] text-[1.8cqw] font-bold tracking-[0.2em] text-white/70">
          NOBODY WAS THE IMPOSTOR
        </p>
      </div>

      <div className="absolute inset-x-0 bottom-[6cqh] z-20 flex flex-col items-center gap-[3cqh]">
        <div className="animate-popIn rounded-[1.4cqw] border-[0.3cqw] border-[#9A6205] bg-[#2A1E08]/90 px-[4cqw] py-[1.6cqh] text-center">
          <div className="text-[1.1cqw] font-bold uppercase tracking-[0.3em] text-white/55">Final score</div>
          <div className="text-[3.4cqw] font-black leading-tight text-[#F0A81C]">
            {myScore} <span className="text-white/40">/ {totalRounds}</span>
          </div>
          <div className="text-[1.2cqw] font-semibold text-white/50">Both players tied</div>
        </div>

        <ChunkyButton tone="amber" onClick={goHome}>
          Go Back to Home Screen
        </ChunkyButton>
      </div>
    </Stage>
  )
}
