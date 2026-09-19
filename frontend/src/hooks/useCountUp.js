import { useEffect, useRef, useState } from 'react';

/**
 * Animate a number from its previous value up/down to `target` over `duration` ms.
 * Returns the current (rounded) display value. Respects prefers-reduced-motion.
 */
export function useCountUp(target, duration = 700) {
  const [display, setDisplay] = useState(target ?? 0);
  const fromRef = useRef(target ?? 0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (target == null) {
      setDisplay(null);
      return undefined;
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current ?? 0;
    const to = target;
    if (reduce || from === to) {
      setDisplay(to);
      fromRef.current = to;
      return undefined;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}
