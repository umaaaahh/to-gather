import { useId } from "react";

/**
 * The pocket-sized boombox drawing: the full Boombox artwork minus the fine
 * detail (hatching, dial, keys) that turns to mush at small sizes, with
 * chunkier strokes so it still reads. Used by the mini radio widget
 * (MiniRadio).
 *
 * Cones carry `mini-boombox-cone left|right` so the caller's CSS can make
 * them thump.
 *
 * @param {string} [accent]  colour of the square "station button" on the front
 */
export default function MiniBoomboxArt({ accent = "#ff9f3f", className = "" }) {
  // Unique per instance: two copies can be on screen at once, and a
  // duplicate filter id would make one borrow the other's (or none, if the
  // first is hidden).
  const filterId = `mini-boombox-crayon-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <svg className={className} viewBox="0 -4 640 404" aria-hidden="true">
      <defs>
        <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="4" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="8" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>

      <g filter={`url(#${filterId})`}>
        {/* Handle */}
        <path
          d="M188 80 L204 30 Q209 16 224 16 L416 16 Q431 16 436 30 L452 80"
          fill="none"
          stroke="#2b2b2b"
          strokeWidth="26"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Feet */}
        <rect x="70" y="370" width="60" height="26" rx="8" fill="#2b2b2b" />
        <rect x="510" y="370" width="60" height="26" rx="8" fill="#2b2b2b" />

        {/* Body */}
        <rect x="20" y="76" width="600" height="302" rx="40" fill="#ef5a4c" stroke="#2b2b2b" strokeWidth="16" />

        {/* Speakers */}
        {[140, 500].map((centerX, i) => (
          <g key={centerX}>
            <circle cx={centerX} cy="236" r="100" fill="#2f6fd6" stroke="#2b2b2b" strokeWidth="14" />
            <g className={`mini-boombox-cone ${i === 0 ? "left" : "right"}`}>
              <circle cx={centerX} cy="236" r="62" fill="#ffd23f" stroke="#2b2b2b" strokeWidth="12" />
              <circle cx={centerX} cy="236" r="24" fill="#2b2b2b" />
            </g>
          </g>
        ))}

        {/* Tuner window and station button */}
        <rect x="250" y="120" width="140" height="70" rx="12" fill="#fff4c9" stroke="#2b2b2b" strokeWidth="12" />
        <rect x="270" y="230" width="100" height="100" rx="18" fill={accent} stroke="#2b2b2b" strokeWidth="12" />
      </g>
    </svg>
  );
}
