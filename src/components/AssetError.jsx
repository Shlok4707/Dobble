/** Shown when src/assets/symbols/ does not hold the 57 images the deck needs. */
export default function AssetError({ errors, count, required }) {
  return (
    <div className="fixed inset-0 overflow-auto bg-space-900 p-8">
      <div className="mx-auto max-w-2xl space-y-5 pt-16">
        <h1 className="au-title text-3xl text-crew-red">Symbol assets missing</h1>

        <p className="text-white/80">
          The deck is built on a projective plane of order 7, which needs exactly{' '}
          <strong className="text-white">{required}</strong> symbols. Right now{' '}
          <code className="rounded bg-black/40 px-1.5 py-0.5 text-crew-cyan">src/assets/symbols/</code> has{' '}
          <strong className="text-white">{count}</strong>.
        </p>

        <ul className="space-y-1 text-sm text-crew-yellow">
          {errors.map((e, i) => (
            <li key={i}>• {e}</li>
          ))}
        </ul>

        <div className="au-panel space-y-2 p-5 text-sm text-white/75">
          <p className="font-bold uppercase tracking-widest text-white">To fix</p>
          <p>
            Put {required} image files (png / jpg / webp / svg) into{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-crew-cyan">src/assets/symbols/</code>. They are
            picked up automatically in natural filename order — no code change needed.
          </p>
          <p>
            To regenerate the throwaway placeholder set:{' '}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-crew-cyan">npm run gen:symbols</code>
          </p>
        </div>
      </div>
    </div>
  )
}
