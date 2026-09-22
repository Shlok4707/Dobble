/**
 * A fixed-aspect "stage" that letterboxes one of the supplied screen mockups
 * and lets everything on top be positioned in percentages.
 *
 * Why this rather than a stretched background: the mockups have artwork baked
 * into specific places (the window panel, the crewmates, the titles). Anchoring
 * overlays to a box that is always exactly the image's aspect ratio means the
 * live code, the input and the buttons land in the right spot at every window
 * size, instead of drifting as the viewport changes shape.
 *
 * `container-type: size` turns the stage into a container-query context, so
 * children can size type and spacing in `cqw`/`cqh` units and scale perfectly
 * with the artwork.
 */
export default function Stage({ bg, aspect = 16 / 9, children, fill = 'blur' }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#070B16]">
      {fill === 'blur' && (
        <img
          src={bg}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl"
        />
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative overflow-hidden"
          style={{
            width: `min(100vw, calc(100vh * ${aspect}))`,
            height: `min(100vh, calc(100vw / ${aspect}))`,
            containerType: 'size',
          }}
        >
          <img src={bg} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-fill" />
          {children}
        </div>
      </div>
    </div>
  )
}
