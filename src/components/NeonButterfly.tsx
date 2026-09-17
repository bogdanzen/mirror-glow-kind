type NeonButterflyProps = {
  className?: string;
  delay?: string;
  reverse?: boolean;
};

export function NeonButterfly({
  className = "",
  delay = "0s",
  reverse = false,
}: NeonButterflyProps) {
  return (
    <div
      aria-hidden
      className={`neon-butterfly ${reverse ? "neon-butterfly-reverse" : ""} ${className}`}
      style={{ animationDelay: delay }}
    >
      <svg viewBox="0 0 180 130" fill="none" role="presentation">
        <path
          className="butterfly-wing butterfly-wing-left"
          d="M88 67C67 29 33 12 17 24C1 37 24 71 75 76C35 78 21 98 34 109C49 121 73 98 89 72"
        />
        <path
          className="butterfly-wing butterfly-wing-right"
          d="M92 67C113 29 147 12 163 24C179 37 156 71 105 76C145 78 159 98 146 109C131 121 107 98 91 72"
        />
        <path d="M90 62C86 74 87 92 90 108C93 92 94 74 90 62Z" />
        <path d="M89 63C82 51 77 43 67 38M91 63C98 51 103 43 113 38" />
      </svg>
    </div>
  );
}

export function CancerRibbon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-label="Panglica roz, simbol internațional al conștientizării cancerului"
      className={className}
      viewBox="0 0 100 150"
      fill="none"
    >
      <path
        d="M50 22C23 0 8 17 15 40C20 58 36 74 50 87C64 74 80 58 85 40C92 17 77 0 50 22ZM50 22C38 39 36 55 44 72M50 22C62 39 64 55 56 72M44 72L18 140M56 72L82 140"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}