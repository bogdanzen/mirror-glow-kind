/**
 * Gala backdrop — entirely generated (no imagery):
 * ivory field, soft golden light veils, and slow rising gold embers.
 */
const EMBERS = Array.from({ length: 18 }, (_, i) => {
  const seed = (i * 97) % 100;
  return {
    left: `${(seed * 1.07) % 100}%`,
    size: 2 + ((i * 7) % 5),
    duration: `${16 + ((i * 5) % 14)}s`,
    delay: `${-(i * 1.7).toFixed(1)}s`,
    drift: `${((i % 5) - 2) * 3}vw`,
    opacity: 0.25 + ((i % 4) * 0.15),
  };
});

export function GildedBackdrop({ intense = false }: { intense?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* warm ivory wash */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 8%, color-mix(in oklab, var(--gold-1) 22%, transparent) 0%, transparent 62%), radial-gradient(90% 60% at 50% 100%, color-mix(in oklab, var(--gold-2) 14%, transparent) 0%, transparent 70%)",
          opacity: intense ? 1 : 0.75,
        }}
      />
      {/* drifting golden veils */}
      <div
        className="veil absolute -left-[20%] top-[8%] h-[70vh] w-[90vw] blur-[120px]"
        style={{
          background:
            "conic-gradient(from 210deg at 50% 50%, transparent 0deg, color-mix(in oklab, var(--gold-2) 45%, transparent) 90deg, transparent 200deg)",
        }}
      />
      <div
        className="veil absolute -right-[25%] bottom-[6%] h-[60vh] w-[85vw] blur-[140px] [animation-delay:-7s]"
        style={{
          background:
            "conic-gradient(from 20deg at 50% 50%, transparent 0deg, color-mix(in oklab, var(--gold-1) 55%, transparent) 120deg, transparent 240deg)",
        }}
      />
      {/* rising embers */}
      {EMBERS.map((e, i) => (
        <span
          key={i}
          className="ember absolute bottom-0 rounded-full"
          style={
            {
              left: e.left,
              width: e.size,
              height: e.size,
              opacity: e.opacity,
              animationDelay: e.delay,
              "--ember-duration": e.duration,
              "--ember-drift": e.drift,
              background:
                "radial-gradient(circle, #fff6df 0%, var(--gold-1) 40%, color-mix(in oklab, var(--gold-2) 60%, transparent) 70%, transparent 100%)",
              boxShadow: "0 0 12px color-mix(in oklab, var(--gold-2) 60%, transparent)",
            } as React.CSSProperties
          }
        />
      ))}
      {/* fine gilded hairline frame */}
      <div className="absolute inset-[3vmin] border border-[color-mix(in_oklab,var(--gold-2)_35%,transparent)]" />
    </div>
  );
}
