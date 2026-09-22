import { useEffect, useRef, useState } from 'react'
import Stage from '../components/Stage.jsx'
import BackButton from '../components/BackButton.jsx'
import ChunkyButton from '../components/ChunkyButton.jsx'
import { useGame } from '../game/GameProvider.jsx'
import { CODE_LENGTH, normaliseCode } from '../game/protocol.js'
import bg from '../assets/screens/join-code.jpg'

const ASPECT = 16 / 9

/** Join Code Page — text box, Click to Play, Back. */
export default function JoinCodePage() {
  const { joinWithCode, status, statusText, error, clearError } = useGame()
  const [value, setValue] = useState('')
  const inputRef = useRef(null)

  const joining = status === 'joining'
  const complete = value.length === CODE_LENGTH

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const onChange = (e) => {
    if (error) clearError()
    setValue(normaliseCode(e.target.value))
  }

  const submit = (e) => {
    e?.preventDefault()
    if (!complete || joining) return
    joinWithCode(value)
  }

  return (
    <Stage bg={bg} aspect={ASPECT}>
      <form onSubmit={submit} className="absolute left-1/2 top-[33cqh] z-20 -translate-x-1/2 text-center">
        {/* The real input, styled as four glowing slots. */}
        <div className="relative">
          <input
            ref={inputRef}
            value={value}
            onChange={onChange}
            disabled={joining}
            maxLength={CODE_LENGTH}
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            aria-label="Enter the 4 character game code"
            className="peer absolute inset-0 z-10 h-full w-full cursor-text bg-transparent text-transparent caret-transparent outline-none"
          />
          <div className="flex items-center justify-center gap-[1.4cqw]">
            {Array.from({ length: CODE_LENGTH }).map((_, i) => {
              const char = value[i] || ''
              const active = !joining && i === Math.min(value.length, CODE_LENGTH - 1)
              return (
                <span
                  key={i}
                  className={[
                    'flex h-[14cqh] w-[8.5cqw] items-center justify-center rounded-[1.2cqw]',
                    'border-[0.35cqw] bg-[#0B1B36]/85 text-[6cqw] font-black text-[#9AD9F5]',
                    'transition-colors duration-150',
                    char
                      ? 'border-[#9AD9F5]/80'
                      : active
                        ? 'border-[#9AD9F5]/60 peer-focus:border-[#9AD9F5]'
                        : 'border-white/20',
                  ].join(' ')}
                  style={char ? { textShadow: '0 0 2cqw rgba(154,217,245,0.75)' } : undefined}
                >
                  {char || <span className="text-white/15">·</span>}
                </span>
              )
            })}
          </div>
        </div>

        <div className="mt-[5cqh]">
          <ChunkyButton tone="green" type="submit" onClick={submit} disabled={!complete || joining}>
            {joining ? 'Connecting…' : 'Click to Play'}
          </ChunkyButton>
        </div>

        <div className="mt-[3cqh] h-[6cqh]">
          {joining && statusText && (
            <p className="rounded-[1cqw] border-[0.25cqw] border-white/25 bg-[#0B1B36]/85 px-[2cqw] py-[1cqh] text-[1.4cqw] font-bold text-white/80">
              {statusText}
            </p>
          )}
          {!joining && error && (
            <p className="animate-popIn rounded-[1cqw] border-[0.25cqw] border-[#7A0838] bg-[#C51111]/90 px-[2cqw] py-[1cqh] text-[1.5cqw] font-bold text-white">
              {error}
            </p>
          )}
        </div>
      </form>

      <BackButton />
    </Stage>
  )
}
