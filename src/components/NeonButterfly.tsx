type NeonButterflyProps = {
  className?: string;
  delay?: string;
  reverse?: boolean;
};

/** One half of the butterfly; mirrored for the other side. */
function Wing() {
  return (
    <g className="butterfly-half">
      {/* forewing */}
      <path
        className="butterfly-outline"
        d="M98 62C78 22 44 6 22 14C4 21 6 48 24 62C40 74 74 76 98 68Z"
      />
      <path
        className="butterfly-outline butterfly-inner"
        d="M95 63C79 33 52 17 31 21C17 24 16 44 30 55C43 65 72 68 95 63Z"
      />
      {/* forewing veins */}
      <path className="butterfly-vein" d="M96 64C70 56 44 42 26 22" />
      <path className="butterfly-vein" d="M96 66C68 62 42 54 20 42" />
      <path className="butterfly-vein" d="M97 60C78 40 60 26 40 14" />
      <path className="butterfly-vein" d="M97 58C86 38 78 24 70 10" />
      {/* hindwing */}
      <path
        className="butterfly-outline"
        d="M97 70C74 74 48 82 38 96C28 110 38 128 54 126C74 124 92 100 98 78Z"
      />
      <path
        className="butterfly-outline butterfly-inner"
        d="M95 75C77 79 57 87 49 98C42 108 49 118 60 115C73 111 89 94 95 75Z"
      />
      {/* hindwing veins */}
      <path className="butterfly-vein" d="M96 76C82 92 70 106 54 118" />
      <path className="butterfly-vein" d="M95 74C78 84 62 94 44 100" />
      <path className="butterfly-vein" d="M96 79C88 95 80 109 70 121" />
      {/* eyespots */}
      <circle className="butterfly-spot" cx="46" cy="28" r="5" />
      <circle className="butterfly-spot" cx="31" cy="44" r="3.4" />
      <circle className="butterfly-spot" cx="63" cy="103" r="4.2" />
      <circle className="butterfly-spot" cx="49" cy="113" r="2.6" />
      {/* antenna */}
      <path className="butterfly-vein" d="M97 56C90 42 82 32 70 24" />
      <circle className="butterfly-spot" cx="69" cy="23" r="2.2" />
    </g>
  );
}

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
      <svg viewBox="0 0 200 140" fill="none" role="presentation">
        <g className="butterfly-wing butterfly-wing-left">
          <Wing />
        </g>
        <g className="butterfly-wing butterfly-wing-right">
          <g transform="translate(200 0) scale(-1 1)">
            <Wing />
          </g>
        </g>
        {/* body */}
        <path
          className="butterfly-outline"
          d="M100 52C95 60 94 74 95 88C96 102 98 112 100 120C102 112 104 102 105 88C106 74 105 60 100 52Z"
        />
        <path className="butterfly-vein" d="M100 60V116M96 70H104M96 82H104M97 94H103" />
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
