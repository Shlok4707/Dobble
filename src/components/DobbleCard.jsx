import { memo, useEffect } from 'react'
import { toCssBox } from '../game/layout.js'
import { getAspect, getSymbol } from '../game/symbols.js'
import { isOpaqueAt, primeMasks } from '../game/hitTest.js'

/**
 * Card Rendering Logic — spec section 15.
 *
 * CLICKABILITY, which the spec is strict about:
 *
 *   - the card itself is `pointer-events-none`, so the disc, its rim, its
 *     drop shadow and every empty gap between symbols are inert
 *   - only the <img> elements re-enable pointer events
 *   - every click is then alpha-tested against the artwork, so the transparent
 *     corners of a symbol's PNG are inert too
 *
 * The result: a click counts only when it lands on visible artwork. A click on
 * the card background, the gaps, the page background or the scoreboard does
 * nothing at all.
 */

function SymbolButton({ placement, onHit, onMiss, disabled, state }) {
  const symbol = getSymbol(placement.symbolId)
  const box = toCssBox(placement, getAspect(placement.symbolId))

  if (!symbol) return null

  const handle = (event) => {
    if (disabled) return

    const img = event.currentTarget
    const u = event.nativeEvent.offsetX / img.clientWidth
    const v = event.nativeEvent.offsetY / img.clientHeight

    // offsetX/offsetY are reported in the element's own untransformed
    // coordinate space, so the rotation applied by the parent is already
    // accounted for and the alpha sample lines up with what was clicked.
    if (isOpaqueAt(symbol.src, u, v)) onHit(placement.symbolId)
    else onMiss()
  }

  const handleKey = (event) => {
    if (disabled) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onHit(placement.symbolId)
    }
  }

  const stateClass =
    state === 'correct'
      ? 'animate-matchGlow'
      : state === 'wrong'
        ? 'animate-shake'
        : state === 'reveal'
          ? 'animate-matchGlow'
          : ''

  return (
    <div
      className={`pointer-events-none absolute ${stateClass}`}
      style={{
        left: `${box.left}%`,
        top: `${box.top}%`,
        width: `${box.width}%`,
        height: `${box.height}%`,
        '--rot': `${placement.rotation}deg`,
        transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
      }}
    >
      <img
        src={symbol.src}
        alt={symbol.label}
        draggable={false}
        onClick={handle}
        onKeyDown={handleKey}
        tabIndex={disabled ? -1 : 0}
        role="button"
        className={[
          'pointer-events-auto h-full w-full select-none object-contain',
          'transition-transform duration-100',
          disabled ? 'cursor-default' : 'cursor-pointer hover:scale-[1.08] active:scale-95',
          state === 'reveal' || state === 'correct' ? 'scale-110' : '',
        ].join(' ')}
        style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))' }}
      />
    </div>
  )
}

function DobbleCard({ layout, onHit, onMiss, disabled = false, revealId = null, feedback = null, label }) {
  // Warm the alpha masks for this round's artwork so the very first click of a
  // round is already pixel-exact rather than falling back to a box hit.
  useEffect(() => {
    const srcs = layout.map((p) => getSymbol(p.symbolId)?.src).filter(Boolean)
    primeMasks(srcs)
  }, [layout])

  return (
    <div
      className="pointer-events-none relative aspect-square w-full animate-cardIn rounded-full
                 border-[0.55cqw] border-[#0B1220] bg-gradient-to-b from-[#F3F7FF] to-[#C9D8EE]"
      style={{ boxShadow: '0 0.8cqw 0 rgba(0,0,0,0.45), inset 0 0 2cqw rgba(0,0,0,0.12)' }}
      aria-label={label}
    >
      {/* Inner rim — decorative only, never clickable. */}
      <div className="pointer-events-none absolute inset-[1.6%] rounded-full border-[0.2cqw] border-black/10" />

      {layout.map((placement) => {
        let state = null
        if (revealId !== null && placement.symbolId === revealId) state = 'reveal'
        else if (feedback && feedback.symbolId === placement.symbolId) {
          if (feedback.kind === 'wrong') state = 'wrong'
          else if (feedback.kind === 'correct') state = 'correct'
        }

        return (
          <SymbolButton
            key={`${placement.symbolId}-${placement.x.toFixed(2)}`}
            placement={placement}
            onHit={onHit}
            onMiss={onMiss}
            disabled={disabled}
            state={state}
          />
        )
      })}
    </div>
  )
}

export default memo(DobbleCard)
