import { useId } from "react";
import "./SunButton.css";

// Rays evenly spaced round the disc; odd ones a touch shorter so it reads as
// hand-drawn rather than a perfect starburst.
const RAYS = Array.from({ length: 10 }, (_, i) => ({
  angle: i * 36,
  inner: 64,
  outer: i % 2 ? 82 : 90,
}));

// The street's Start/Return button, drawn as a crayon sun in the sky. The
// crayon look is an SVG filter: fractal noise wobbles the edges and speckles
// the fill so it matches the hand-coloured street art, and diagonal hatching
// across the disc echoes the kangaroo's shading. className/onClick/children
// pass straight through, so it's still the plain .scene-cta button the tour
// spotlights.
export default function SunButton({ className = "", children, ...props }) {
  const id = useId().replace(/:/g, "");

  return (
    <button type="button" className={`sun-button ${className}`} {...props}>
      <svg className="sun-button-art" viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <filter id={`${id}-crayon`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="wobble" />
            <feDisplacementMap in="SourceGraphic" in2="wobble" scale="5" result="drawn" />
            <feTurbulence type="fractalNoise" baseFrequency="1.8" numOctaves="1" seed="8" result="grain" />
            <feColorMatrix
              in="grain"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.75"
              result="grainAlpha"
            />
            <feComposite in="drawn" in2="grainAlpha" operator="in" />
          </filter>
          <pattern
            id={`${id}-hatch`}
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <line x1="0" y1="0" x2="0" y2="7" stroke="#fbe7a1" strokeWidth="2.5" />
          </pattern>
          <clipPath id={`${id}-disc`}>
            <circle cx="100" cy="100" r="52" />
          </clipPath>
        </defs>

        <g className="sun-button-rays" filter={`url(#${id}-crayon)`}>
          {RAYS.map((ray) => (
            <line
              key={ray.angle}
              x1="100"
              y1={100 - ray.inner}
              x2="100"
              y2={100 - ray.outer}
              transform={`rotate(${ray.angle} 100 100)`}
              stroke="#f7b54a"
              strokeWidth="9"
              strokeLinecap="round"
            />
          ))}
        </g>

        <g filter={`url(#${id}-crayon)`}>
          <circle cx="100" cy="100" r="52" fill="#ffd36b" />
          <rect x="40" y="40" width="120" height="120" fill={`url(#${id}-hatch)`} clipPath={`url(#${id}-disc)`} />
          <circle cx="100" cy="100" r="52" fill="none" stroke="#e8923a" strokeWidth="5" />
          {/* Rosy cheeks, like the kangaroo's. */}
          <ellipse cx="70" cy="116" rx="9" ry="6" fill="#f08a7e" opacity="0.8" />
          <ellipse cx="130" cy="116" rx="9" ry="6" fill="#f08a7e" opacity="0.8" />
        </g>
      </svg>

      <span className="sun-button-label">{children}</span>
    </button>
  );
}
