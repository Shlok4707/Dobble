import Stage from '../components/Stage.jsx'
import { useGame } from '../game/GameProvider.jsx'
import bg from '../assets/screens/timer.jpg'

const ASPECT = 16 / 9

/**
 * Game Start Timer Page — 3 → 2 → 1 → START.
 *
 * The countdown is driven by the host: it broadcasts each tick as it fires, so
 * both PCs change number within a few milliseconds of each other regardless of
 * clock differences between the machines.
 */
export default function GameStartTimerPage() {
  const { countdown, status } = useGame()
  const isGo = countdown === 'START'

  return (
    <Stage bg={bg} aspect={ASPECT}>
      <div className="pointer-events-none absolute left-1/2 top-[40cqh] z-20 -translate-x-1/2 -translate-y-1/2 text-center">
        {countdown === null ? (
          <p className="text-[2.2cqw] font-bold tracking-[0.2em] text-white/70">
            {status === 'connected' ? 'GET READY…' : 'CONNECTING…'}
          </p>
        ) : (
          <span
            key={String(countdown)}
            className={[
              'block animate-countPop font-black leading-none',
              isGo ? 'text-[9cqw] text-[#50EF39]' : 'text-[16cqw] text-white',
            ].join(' ')}
            style={{
              textShadow: isGo
                ? '0 0 3cqw rgba(80,239,57,0.8), 0 0.6cqw 0 rgba(0,0,0,0.5)'
                : '0 0 3cqw rgba(154,217,245,0.7), 0 0.6cqw 0 rgba(0,0,0,0.5)',
            }}
          >
            {isGo ? 'START!' : countdown}
          </span>
        )}
      </div>
    </Stage>
  )
}
