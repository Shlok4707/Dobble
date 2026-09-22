import Stage from '../components/Stage.jsx'
import ChunkyButton from '../components/ChunkyButton.jsx'
import { useGame } from '../game/GameProvider.jsx'
import bg from '../assets/screens/winner.jpg'

const ASPECT = 16 / 9

/** Winner Page — final score out of 9 and a way back to the Home Page. */
export default function WinnerPage() {
  const { myScore, opponentScore, totalRounds, goHome } = useGame()

  return (
    <Stage bg={bg} aspect={ASPECT}>
      <div className="absolute inset-x-0 bottom-[6cqh] z-20 flex flex-col items-center gap-[3cqh]">
        <div className="animate-popIn rounded-[1.4cqw] border-[0.3cqw] border-[#0A5B28] bg-[#0B2A18]/90 px-[4cqw] py-[1.6cqh] text-center">
          <div className="text-[1.1cqw] font-bold uppercase tracking-[0.3em] text-white/55">Final score</div>
          <div className="text-[3.4cqw] font-black leading-tight text-[#50EF39]">
            {myScore} <span className="text-white/40">/ {totalRounds}</span>
          </div>
          <div className="text-[1.2cqw] font-semibold text-white/50">Opponent: {opponentScore}</div>
        </div>

        <ChunkyButton tone="green" onClick={goHome}>
          Go Back to Home Screen
        </ChunkyButton>
      </div>
    </Stage>
  )
}
