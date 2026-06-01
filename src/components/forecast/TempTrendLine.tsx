// TempTrendLine.tsx — SVG dual-line temperature trend (hi + lo lines).
//
// Used by DailyColumns to show the week's temperature trend.
// Two polylines: highs in var(--temp-hi), lows in var(--temp-lo).
// Each line uses a split-axis approach matching C3-forecast-page.html:
//   - Hi line occupies top 52% of chart height (peaks near top)
//   - Lo line occupies bottom 50% of chart height (valleys near bottom)
// This ensures both lines show maximum visual variation independently.
//
// When `mode="hourly"` (single line for HourlyStrip), only highs are rendered
// using var(--primary) colour (accent blue).

export interface TempTrendLineProps {
  /** High temperature values per column. null values are skipped. */
  highs: (number | null)[];
  /** Low temperature values per column. null values are skipped.
   *  When omitted or all-null, only the high (single accent) line is drawn. */
  lows?: (number | null)[];
  /** SVG viewBox width in internal units. Default 700. */
  width?: number;
  /** SVG viewBox height in internal units. Default 35. */
  height?: number;
  /** When 'hourly': single accent-blue line using highs only. Default 'daily'. */
  mode?: 'daily' | 'hourly';
  className?: string;
}

export function TempTrendLine({
  highs,
  lows,
  width = 700,
  height = 35,
  mode = 'daily',
  className,
}: TempTrendLineProps) {
  const N = highs.length;
  if (N < 2) return null;

  const colW = width / N;
  const pad = 2;

  // ── single accent-blue line (hourly mode) ───────────────────────────────
  if (mode === 'hourly') {
    const vals = highs.filter((v): v is number => v !== null);
    if (vals.length < 2) return null;
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 1;

    const points = highs
      .map((v, i) => {
        if (v === null) return null;
        const cx = i * colW + colW / 2;
        const cy = height - pad - ((v - minV) / range) * (height - 2 * pad);
        return `${cx},${cy}`;
      })
      .filter(Boolean)
      .join(' ');

    const dots = highs.map((v, i) => {
      if (v === null) return null;
      const cx = i * colW + colW / 2;
      const cy = height - pad - ((v - minV) / range) * (height - 2 * pad);
      return (
        <circle key={i} cx={cx} cy={cy} r={2} fill="var(--primary)" />
      );
    });

    return (
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={className}
        style={{ display: 'block', overflow: 'visible', flexShrink: 0 }}
        aria-hidden="true"
      >
        <polyline
          points={points}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {dots}
      </svg>
    );
  }

  // ── dual lines (daily mode) ─────────────────────────────────────────────
  const hiVals = highs.filter((v): v is number => v !== null);
  const loVals = (lows ?? []).filter((v): v is number => v !== null);

  if (hiVals.length < 2 && loVals.length < 2) return null;

  // Hi and Lo each use their own min/max to maximise visible variation.
  const minH = hiVals.length ? Math.min(...hiVals) : 0;
  const maxH = hiVals.length ? Math.max(...hiVals) : 1;
  const ranH = maxH - minH || 1;

  const minL = loVals.length ? Math.min(...loVals) : 0;
  const maxL = loVals.length ? Math.max(...loVals) : 1;
  const ranL = maxL - minL || 1;

  // Hi occupies top half; Lo occupies bottom half (split-axis)
  const hiTop = pad;
  const hiBot = height * 0.52;
  const loTop = height * 0.50;
  const loBot = height - pad;

  function toHiY(v: number): number {
    return hiBot - ((v - minH) / ranH) * (hiBot - hiTop);
  }
  function toLoY(v: number): number {
    return loBot - ((v - minL) / ranL) * (loBot - loTop);
  }

  const hiPoints = highs
    .map((v, i) => {
      if (v === null) return null;
      return `${i * colW + colW / 2},${toHiY(v)}`;
    })
    .filter(Boolean)
    .join(' ');

  const loPoints = (lows ?? [])
    .map((v, i) => {
      if (v === null) return null;
      return `${i * colW + colW / 2},${toLoY(v)}`;
    })
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ display: 'block', overflow: 'visible', flexShrink: 0 }}
      aria-hidden="true"
    >
      {hiPoints && (
        <polyline
          points={hiPoints}
          fill="none"
          stroke="var(--temp-hi)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {loPoints && (
        <polyline
          points={loPoints}
          fill="none"
          stroke="var(--temp-lo)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {/* Hi dots */}
      {highs.map((v, i) => {
        if (v === null) return null;
        return (
          <circle
            key={`hi-${i}`}
            cx={i * colW + colW / 2}
            cy={toHiY(v)}
            r={2}
            fill="var(--temp-hi)"
            stroke="rgba(255,255,255,0.7)"
            strokeWidth={0.8}
          />
        );
      })}
      {/* Lo dots */}
      {(lows ?? []).map((v, i) => {
        if (v === null) return null;
        return (
          <circle
            key={`lo-${i}`}
            cx={i * colW + colW / 2}
            cy={toLoY(v)}
            r={2}
            fill="var(--temp-lo)"
            stroke="rgba(255,255,255,0.7)"
            strokeWidth={0.8}
          />
        );
      })}
    </svg>
  );
}

export default TempTrendLine;
