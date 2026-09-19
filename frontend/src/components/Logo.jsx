import { useId } from 'react';

/**
 * AI LifeOS logo mark: a rounded gradient badge holding an orbiting loop (the
 * PLAN → TRACK → IMPROVE daily loop) around a bright "today" dot. Brand colors are
 * fixed (independent of theme) so the mark stays recognizable everywhere.
 */
export function LogoMark({ size = 32 }) {
  const id = useId();
  const g = `lg-${id}`;
  const g2 = `lg2-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id={g2} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e9d5ff" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="14" fill={`url(#${g})`} />
      {/* Orbit loop with a gap + arrow tip */}
      <path
        d="M33 17.5 A12 12 0 1 0 35.5 27"
        fill="none"
        stroke={`url(#${g2})`}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path d="M33 12.6 L33.4 18.2 L28 17.2 Z" fill="#ffffff" />
      {/* Today dot — gently pulses (ambient life) */}
      <circle cx="24" cy="24" r="4.4" fill="#ffffff" className="logoDot" />
    </svg>
  );
}

/** Logo mark + optional wordmark. */
export default function Logo({ size = 30, withWord = true, className }) {
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 9, whiteSpace: 'nowrap' }}
    >
      <LogoMark size={size} />
      {withWord && (
        <span style={{ fontWeight: 730, letterSpacing: '-0.02em', fontSize: size * 0.56 }}>
          AI LifeOS
        </span>
      )}
    </span>
  );
}
