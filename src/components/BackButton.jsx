import ChunkyButton from './ChunkyButton.jsx'
import { useGame } from '../game/GameProvider.jsx'

/**
 * "Back" at the bottom-right of the Code Created Page and Join Code Page.
 *
 * Pressing it always terminates the session: the peer is destroyed, which
 * releases the 4-character code and tells the other PC to leave, so nobody is
 * left waiting on an abandoned game.
 */
export default function BackButton({ label = 'Back' }) {
  const { goHome } = useGame()

  return (
    <div className="absolute bottom-[4cqh] right-[3cqw] z-20">
      <ChunkyButton tone="slate" onClick={goHome}>
        <span aria-hidden="true">←</span> {label}
      </ChunkyButton>
    </div>
  )
}
