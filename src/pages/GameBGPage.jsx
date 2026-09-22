import { useEffect, useState } from 'react'
import Stage from '../components/Stage.jsx'
import DobbleCard from '../components/DobbleCard.jsx'
import { useGame } from '../game/GameProvider.jsx'
import { PHASE, ROLE } from '../game/protocol.js'
import bg from '../assets/screens/game-bg.jpg'

const ASPECT = 1600 / 901

/**
 * Game BG Page — the two cards, the scoreboard and nothing else clickable.
 *
 * Everything in this file except the symbol images is `pointer-events-none`:
 * the background, the cards, the scoreboard, the round banner. Only artwork
 * inside a card can register an answer.
 */
export default function GameBGPage() {
  const { snapshot, role, myScore, opponentScore, clickSymbol, clickedNothing, feedback } = useGame()

  const roundOver = snapshot.phase === PHASE.ROUND_END
  const iWonRound = roundOver && snapshot.roundWinner === role
  const [floaters, setFloaters] = useState([])

  // "+1" floats up from the scoreboard when this player takes a round.
  useEffect(() => {
    if (!iWonRound) return
    const id = Date.now()
    setFloaters((f) => [...f, id])
    const t = setTimeout(() => setFloaters((f) => f.filter((x) => x !== id)), 1200)
    return () => clearTimeout(t)
  }, [iWonRound, snapshot.round])

  // Only surface feedback that is still fresh, so a stale shake never leaks
  // into the next round.
  const liveFeedback = feedback && Date.now() - feedback.at < 900 ? feedback : null

  return (
    <Stage bg={bg} aspect={ASPECT}>
      {/* ---------------------------------------------------- scoreboard */}
      <div className="pointer-events-none absolute inset-x-0 top-[2.5cqh] z-20 flex items-center justify-center gap-[3cqw]">
        <ScorePill label="You" value={myScore} tone="cyan" floaters={floaters} />

        <div className="rounded-[1cqw] border-[0.25cqw] border-white/20 bg-[#0B1B36]/80 px-[2.2cqw] py-[0.8cqh] text-center">
          <div className="text-[0.95cqw] font-bold uppercase tracking-[0.25em] text-white/50">Round</div>
          <div className="text-[2.1cqw] font-black leading-tight text-white">
            {Math.min(snapshot.round + 1, snapshot.totalRounds)}
            <span className="text-white/45"> / {snapshot.totalRounds}</span>
          </div>
        </div>

        <ScorePill label="Opponent" value={opponentScore} tone="red" />
      </div>

      {/* --------------------------------------------------------- cards */}
      <div className="absolute inset-x-0 top-[16cqh] z-10 flex items-start justify-center gap-[3cqw]">
        <div className="h-[70cqh] w-[70cqh]">
          <DobbleCard
            label="Card one"
            layout={snapshot.layoutA}
            onHit={clickSymbol}
            onMiss={clickedNothing}
            disabled={roundOver}
            revealId={roundOver ? snapshot.matchId : null}
            feedback={liveFeedback}
          />
        </div>
        <div className="h-[70cqh] w-[70cqh]">
          <DobbleCard
            label="Card two"
            layout={snapshot.layoutB}
            onHit={clickSymbol}
            onMiss={clickedNothing}
            disabled={roundOver}
            revealId={roundOver ? snapshot.matchId : null}
            feedback={liveFeedback}
          />
        </div>
      </div>

      {/* -------------------------------------------------- round banner */}
      {roundOver && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[3cqh] z-30 flex justify-center">
          <div
            className={[
              'animate-popIn rounded-[1.4cqw] border-[0.35cqw] px-[4cqw] py-[1.8cqh]',
              'text-[3cqw] font-black uppercase tracking-[0.12em] text-white',
              iWonRound ? 'border-[#0A5B28] bg-[#16A34A]/95' : 'border-[#7A0838] bg-[#C51111]/95',
            ].join(' ')}
            style={{ textShadow: '0 0.3cqw 0 rgba(0,0,0,0.45)' }}
          >
            {iWonRound ? 'You got it!' : 'Opponent got it'}
          </div>
        </div>
      )}
    </Stage>
  )
}

function ScorePill({ label, value, tone, floaters = [] }) {
  const toneClass = tone === 'cyan' ? 'border-[#2E7E93] bg-[#0E3A4A]/85' : 'border-[#7A0838] bg-[#4A0B18]/85'
  const valueClass = tone === 'cyan' ? 'text-[#38FEDC]' : 'text-[#FF8080]'

  return (
    <div className={`relative rounded-[1cqw] border-[0.25cqw] px-[2.4cqw] py-[0.8cqh] text-center ${toneClass}`}>
      <div className="text-[0.95cqw] font-bold uppercase tracking-[0.25em] text-white/55">{label}</div>
      <div className={`text-[2.4cqw] font-black leading-tight ${valueClass}`}>{value}</div>

      {floaters.map((id) => (
        <span
          key={id}
          className="pointer-events-none absolute left-1/2 top-full animate-floatUp text-[2.4cqw] font-black text-[#50EF39]"
          style={{ textShadow: '0 0 1.5cqw rgba(80,239,57,0.8)' }}
        >
          +1
        </span>
      ))}
    </div>
  )
}
