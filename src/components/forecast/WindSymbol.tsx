// WindSymbol.tsx — BBC Weather-style wind direction symbol (ADR-049 C3).
//
// A grey filled circle showing the wind speed number with a triangular pointer
// tail extending from the circle edge indicating wind direction (FROM direction).
//
// Geometry (matches C3-wind-symbol.html exactly):
//   - pad = r * 1.4  → generous canvas so tail never clips at any rotation
//   - tail tip extends r*0.65 beyond circle edge
//   - tail base half-width = r*0.42
//   - gap between circle edge and tail base = r*0.1
//   - Tail group rotates `bearing` degrees around circle centre
//   - Speed text is NOT in the rotated group (stays upright)
//
// ALL wind symbols in the app use size=20 (r=10) per the locked spec.

export interface WindSymbolProps {
  /** Wind direction bearing in degrees (0=N, 90=E, 180=S, 270=W). Null hides the tail. */
  bearing: number | null;
  /** Wind speed to display inside the circle (number or pre-formatted string). */
  speed: number | string;
  /** Circle diameter in px. Default 20 (r=10). ALL app symbols use 20. */
  size?: number;
}

export function WindSymbol({ bearing, speed, size = 20 }: WindSymbolProps) {
  const r = size / 2;
  const pad = r * 1.4;
  const cx = r + pad;
  const cy = r + pad;

  const tailExt = r * 0.65;
  const tailBHalf = r * 0.42;
  const gap = r * 0.1;

  // Tail points (pointing UP/North in SVG space; rotated via transform)
  const tipX = cx;
  const tipY = cy - r - gap - tailExt;
  const bLX = cx - tailBHalf;
  const bLY = cy - r - gap;
  const bRX = cx + tailBHalf;
  const bRY = cy - r - gap;

  const svgW = cx * 2;
  const svgH = cy * 2;
  const fontSize = r * 1.15;

  const speedStr = typeof speed === 'number' ? String(Math.round(speed)) : speed;

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      overflow="visible"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'inline-block', flexShrink: 0 }}
    >
      {/* Tail group: rotated bearing° around circle centre; hidden when direction unknown */}
      {bearing !== null && (
        <g transform={`rotate(${bearing}, ${cx}, ${cy})`}>
          <polygon
            points={`${tipX},${tipY} ${bLX},${bLY} ${bRX},${bRY}`}
            fill="#94a3b8"
            stroke="#6b7280"
            strokeWidth={0.5}
            strokeLinejoin="round"
          />
        </g>
      )}
      {/* Circle body (rendered on top of tail so it masks the base join) */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="#cbd5e1"
        stroke="#94a3b8"
        strokeWidth={0.8}
      />
      {/* Speed number — NOT in the rotated group, always upright */}
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight={400}
        fontSize={fontSize}
        fill="#1a1a1a"
      >
        {speedStr}
      </text>
    </svg>
  );
}

export default WindSymbol;
