/** Asset Preloading Logic — spec section 20. Shows "Loaded 32 / 57". */
export default function LoadingScreen({ loaded, total }) {
  const pct = total ? Math.round((loaded / total) * 100) : 0

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-space-900 px-8">
      <h1 className="au-title text-3xl text-white sm:text-5xl">
        Among Us <span className="text-crew-yellow">Dobble</span>
      </h1>

      <div className="h-4 w-full max-w-md overflow-hidden rounded-full border-[3px] border-black/60 bg-space-700">
        <div
          className="h-full rounded-full bg-gradient-to-r from-crew-cyan to-crew-lime transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-sm font-bold uppercase tracking-[0.3em] text-white/60">
        Loaded {loaded} / {total} symbols
      </p>
    </div>
  )
}
