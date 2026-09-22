const TONES = {
  red: 'bg-[#C51111] border-[#7A0838] hover:bg-[#D92020]',
  blue: 'bg-[#1F5FD0] border-[#0C2C74] hover:bg-[#2A72E8]',
  green: 'bg-[#16A34A] border-[#0A5B28] hover:bg-[#1BBE58]',
  slate: 'bg-[#2C3E63] border-[#141F38] hover:bg-[#38507E]',
  amber: 'bg-[#F0A81C] border-[#9A6205] hover:bg-[#FFBB33]',
}

/**
 * The chunky Among Us style button: thick dark border, hard drop shadow,
 * presses down on click.
 * Sizes are in container-query units so buttons scale with the stage artwork.
 */
export default function ChunkyButton({
  children,
  onClick,
  tone = 'blue',
  className = '',
  disabled = false,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={[
        'relative inline-flex items-center justify-center gap-[1cqw] select-none',
        'rounded-[1.4cqw] border-[0.35cqw] px-[3.2cqw] py-[1.4cqw]',
        'text-[2cqw] font-black uppercase tracking-[0.12em] text-white',
        'shadow-[0_0.7cqw_0_0_rgba(0,0,0,0.5)] transition-all duration-100',
        'active:translate-y-[0.6cqw] active:shadow-none',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0',
        TONES[tone] || TONES.blue,
        className,
      ].join(' ')}
      style={{ textShadow: '0 0.2cqw 0 rgba(0,0,0,0.45)' }}
      {...rest}
    >
      {children}
    </button>
  )
}
