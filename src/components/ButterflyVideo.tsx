import butterfliesVideo from "@/assets/butterflies-alpha.webm";

export function ButterflyVideo({ className = "" }: { className?: string }) {
  return (
    <video
      aria-hidden
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      className={`pointer-events-none ${className}`}
    >
      <source src={butterfliesVideo} type="video/webm" />
    </video>
  );
}