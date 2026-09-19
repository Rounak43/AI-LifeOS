/**
 * Tiny dependency-free SVG charts for analytics. Values may contain nulls (gaps).
 * Colors come from CSS variables so they adapt to the active theme.
 */
const W = 300;
const H = 64;

export function Bars({ values, max, color = 'var(--accent)' }) {
  const top = max ?? Math.max(1, ...values.map((v) => v ?? 0));
  const n = values.length || 1;
  const gap = 2;
  const bw = (W - gap * (n - 1)) / n;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chartSvg" style={{ width: '100%', height: H }}>
      {values.map((v, i) => {
        const h = v == null ? 0 : (v / top) * (H - 4);
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={H - h}
            width={bw}
            height={h}
            rx={Math.min(2, bw / 3)}
            fill={v == null ? 'var(--surface-2)' : color}
          />
        );
      })}
    </svg>
  );
}

export function Line({ values, max, color = 'var(--accent)' }) {
  const nums = values.map((v) => (v == null ? null : v));
  const top = max ?? Math.max(1, ...nums.filter((v) => v != null));
  const n = values.length || 1;
  const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v) => H - 3 - (v / top) * (H - 6);

  // Build segments split on nulls.
  const segs = [];
  let cur = [];
  nums.forEach((v, i) => {
    if (v == null) {
      if (cur.length) segs.push(cur);
      cur = [];
    } else {
      cur.push(`${x(i)},${y(v)}`);
    }
  });
  if (cur.length) segs.push(cur);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chartSvg" style={{ width: '100%', height: H }}>
      {segs.map((pts, i) => (
        <polyline key={i} points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
      {nums.map((v, i) => (v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill={color} />))}
    </svg>
  );
}
