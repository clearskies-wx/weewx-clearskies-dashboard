// HaysChart.tsx — T4.x
//
// Renders a custom SVG polar arearange chart for pollen / allergen data.
// Each position around the circle represents one time period (day or month).
// Each band (annular sector) spans from the low value radius to the high value
// radius, visually encoding the min–max range for that period.
//
// Based on the Belchertown haysChart pattern:
//   chart.type = "arearange", chart.polar = true, connectEnds = false
//   yAxis.tickInterval = 2, yAxis.min = -1
//
// Accessibility (same pattern as WeatherRangeChart — WCAG 2.1 AA):
//   - SVG has role="img" + aria-labelledby pointing to a visually-hidden title
//   - sr-only <table> provides all values to screen readers (WCAG 1.1.1)
//   - Each band path is keyboard-accessible via tabIndex
//   - Custom SVG focus ring (SVG paths cannot use CSS :focus-visible with outline)
//   - CSS variables for all colors (both light and dark themes)
//   - reducedMotion prop suppresses transitions when prefers-reduced-motion is active
//   - Color is paired with position (not color-only signal — WCAG 1.4.1)

import { useState, useId, useCallback, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface HaysChartProps {
  /** High value per period — from agg=max archive fetch. */
  highData: Array<{ dateTime: number; value: number | null }>;
  /** Low value per period — from agg=min archive fetch. */
  lowData: Array<{ dateTime: number; value: number | null }>;
  /** Observation field name, used in accessible labels and table caption. */
  field: string;
  /** Unit string appended to displayed values (e.g. "ppm", "grains/m³", ""). */
  unit?: string;
  /**
   * Suggested Y-axis maximum. When provided, the radial scale's upper bound
   * is at least this value (but may be larger if data exceeds it).
   */
  softMax?: number;
  /** Container height in pixels (default 300). Chart renders as a square. */
  height?: number;
  /** When true, disables CSS transitions on SVG elements. */
  reducedMotion?: boolean;
}

// ---------------------------------------------------------------------------
// Arc / radial band path helper
// ---------------------------------------------------------------------------

/**
 * Returns an SVG path string for an annular sector (the band between two radii).
 * Angles in degrees: 0 = top (12 o'clock), increasing clockwise.
 */
function radialBandPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number,
): string {
  if (outerR <= innerR || outerR <= 0 || innerR < 0) return '';

  function toRad(deg: number): number {
    // SVG convention: 0° at right (3 o'clock). We want 0° at top (12 o'clock),
    // so subtract 90° before converting to radians. Clockwise = increasing angle.
    return ((deg - 90) * Math.PI) / 180;
  }

  const s = toRad(startDeg);
  const e = toRad(endDeg);

  // Outer arc — clockwise
  const ox1 = cx + outerR * Math.cos(s);
  const oy1 = cy + outerR * Math.sin(s);
  const ox2 = cx + outerR * Math.cos(e);
  const oy2 = cy + outerR * Math.sin(e);

  // Inner arc — counterclockwise (sweep-flag=0 on return)
  const ix1 = cx + innerR * Math.cos(e);
  const iy1 = cy + innerR * Math.sin(e);
  const ix2 = cx + innerR * Math.cos(s);
  const iy2 = cy + innerR * Math.sin(s);

  const largeArc = endDeg - startDeg >= 180 ? 1 : 0;

  return [
    `M ${ox1.toFixed(2)} ${oy1.toFixed(2)}`,
    `A ${outerR.toFixed(2)} ${outerR.toFixed(2)} 0 ${largeArc} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)}`,
    `L ${ix1.toFixed(2)} ${iy1.toFixed(2)}`,
    `A ${innerR.toFixed(2)} ${innerR.toFixed(2)} 0 ${largeArc} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)}`,
    'Z',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// ResizeObserver hook — mirrors WeatherRangeChart pattern
// ---------------------------------------------------------------------------

function useContainerWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(300);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(el);
    setWidth(el.getBoundingClientRect().width || 300);

    return () => observer.disconnect();
  }, [ref]);

  return width;
}

// ---------------------------------------------------------------------------
// Period label helpers — mirrors WeatherRangeChart
// ---------------------------------------------------------------------------

/**
 * Short label shown around the chart perimeter.
 * Monthly data (≤12 points) → month abbreviation; daily → day-of-month number.
 */
function periodLabel(dateTime: number, totalCount: number): string {
  const d = new Date(dateTime * 1000);
  if (totalCount <= 12) {
    return d.toLocaleString('default', { month: 'short' });
  }
  return String(d.getDate());
}

/**
 * Full date string for tooltip and sr-only table rows.
 */
function fullDateLabel(dateTime: number, totalCount: number): string {
  const d = new Date(dateTime * 1000);
  if (totalCount <= 12) {
    return d.toLocaleString('default', { month: 'long', year: 'numeric' });
  }
  return d.toLocaleDateString('default', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Tooltip state
// ---------------------------------------------------------------------------

interface TooltipState {
  label: string;
  high: number | null;
  low: number | null;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Inner SVG component
// ---------------------------------------------------------------------------

interface HaysChartSvgProps {
  highData: Array<{ dateTime: number; value: number | null }>;
  lowData: Array<{ dateTime: number; value: number | null }>;
  unit: string;
  softMax: number | undefined;
  size: number;
  reducedMotion: boolean;
  titleId: string;
}

function HaysChartSvg({
  highData,
  lowData,
  unit,
  softMax,
  size,
  reducedMotion,
  titleId,
}: HaysChartSvgProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const cx = size / 2;
  const cy = size / 2;

  // Space around the outer edge for period labels
  const labelMargin = Math.max(24, size * 0.1);
  const maxRadius = cx - labelMargin;

  // Compute global min/max across all valid data points.
  // The Belchertown haysChart uses yAxis.min = -1 (a slight negative offset so
  // zero-valued periods have a visible sliver). We use 0 as the practical floor
  // and clamp the inner radius to a minimum so zero-value bars stay visible.
  const allValues: number[] = [];
  highData.forEach((d) => { if (d.value !== null) allValues.push(d.value); });
  lowData.forEach((d) => { if (d.value !== null) allValues.push(d.value); });

  const dataMin = 0; // pollen counts are non-negative; center = zero
  const dataMaxRaw = allValues.length > 0 ? Math.max(...allValues) : 1;
  // Respect softMax: use whichever is larger so the axis doesn't clip real data.
  const dataMax = softMax != null ? Math.max(dataMaxRaw, softMax) : dataMaxRaw;
  const range = dataMax - dataMin || 1;

  // Scale a value to a radius. Zero maps to a small positive radius (visible sliver).
  const MIN_R = Math.max(4, size * 0.035);
  function valueToRadius(v: number): number {
    const clamped = Math.max(0, v);
    return MIN_R + (clamped / range) * (maxRadius - MIN_R);
  }

  const totalCount = highData.length;
  if (totalCount === 0) return null;

  const stepDeg = 360 / totalCount;
  // Gap between adjacent bands (narrower at high period counts)
  const gapDeg = totalCount > 20 ? 0.5 : 1.0;

  // Dismiss tooltip / focus ring on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTooltip(null);
        setFocusedIndex(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const getTooltipCoords = useCallback(
    (clientX: number, clientY: number) => {
      const svgRect = svgRef.current?.getBoundingClientRect();
      if (!svgRect) return null;
      return { x: clientX - svgRect.left, y: clientY - svgRect.top };
    },
    [],
  );

  // Build one annular sector per period
  const bands: React.ReactNode[] = [];
  let focusedPathD: string | null = null;

  for (let i = 0; i < totalCount; i++) {
    const highPoint = highData[i];
    const lowPoint = lowData[i] ?? highData[i];

    if (!highPoint || highPoint.value === null) continue;

    const highVal = highPoint.value;
    const lowVal = lowPoint.value ?? highVal;

    const innerR = valueToRadius(Math.min(highVal, lowVal));
    // Ensure a minimum 1px radial thickness so even equal high/low bands render
    const outerR = Math.max(valueToRadius(Math.max(highVal, lowVal)), innerR + 1);

    const centerAngle = i * stepDeg;
    const startAngle = centerAngle - stepDeg / 2 + gapDeg / 2;
    const endAngle = centerAngle + stepDeg / 2 - gapDeg / 2;

    const pathD = radialBandPath(cx, cy, innerR, outerR, startAngle, endAngle);
    if (!pathD) continue;

    const label = fullDateLabel(highPoint.dateTime, totalCount);

    if (focusedIndex === i) {
      focusedPathD = pathD;
    }

    bands.push(
      <path
        key={i}
        d={pathD}
        // Primary color with slight opacity to show overlapping context without obscuring gridlines
        fill="var(--primary)"
        fillOpacity={0.75}
        stroke="var(--background)"
        strokeWidth={0.5}
        tabIndex={0}
        aria-label={`${label}: high ${highVal.toFixed(1)}${unit}, low ${lowVal.toFixed(1)}${unit}`}
        style={{
          cursor: 'pointer',
          // outline:none is replaced by the explicit SVG focus ring below (WCAG 2.4.7)
          outline: 'none',
          transition: reducedMotion ? 'none' : 'fill-opacity 0.12s ease',
        }}
        onPointerEnter={(e) => {
          const coords = getTooltipCoords(e.clientX, e.clientY);
          if (!coords) return;
          setTooltip({ label, high: highVal, low: lowVal, ...coords });
        }}
        onPointerMove={(e) => {
          const coords = getTooltipCoords(e.clientX, e.clientY);
          if (!coords) return;
          setTooltip((prev) => (prev ? { ...prev, ...coords } : prev));
        }}
        onPointerLeave={() => setTooltip(null)}
        onFocus={(e) => {
          setFocusedIndex(i);
          const rect = e.currentTarget.getBoundingClientRect();
          const svgRect = svgRef.current?.getBoundingClientRect();
          if (!svgRect) return;
          setTooltip({
            label,
            high: highVal,
            low: lowVal,
            x: rect.left + rect.width / 2 - svgRect.left,
            y: rect.top + rect.height / 2 - svgRect.top,
          });
        }}
        onBlur={() => {
          setFocusedIndex(null);
          setTooltip(null);
        }}
      />,
    );
  }

  // Concentric gridlines at regular value intervals (mirrors Belchertown's yAxis.tickInterval=2).
  // We pick a round tick interval based on the data range for clarity.
  const GRID_COUNT = 4;
  const gridLines = Array.from({ length: GRID_COUNT }, (_, i) => {
    const fraction = (i + 1) / GRID_COUNT;
    const val = dataMin + fraction * range;
    const r = MIN_R + fraction * (maxRadius - MIN_R);
    return (
      <g key={`grid-${i}`}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--border)"
          strokeWidth={0.75}
          strokeDasharray="2 3"
          aria-hidden="true"
        />
        <text
          x={cx}
          y={cy - r - 3}
          textAnchor="middle"
          fontSize={Math.max(7, size * 0.026)}
          fill="var(--muted-foreground)"
          aria-hidden="true"
        >
          {val.toFixed(0)}{unit}
        </text>
      </g>
    );
  });

  // Outer boundary ring
  const outerRing = (
    <circle
      cx={cx}
      cy={cy}
      r={maxRadius}
      fill="transparent"
      stroke="var(--border)"
      strokeWidth={1}
      aria-hidden="true"
    />
  );

  // Period labels — thin out when there are many periods to avoid overlap
  const labelInterval = totalCount > 28 ? 7 : totalCount > 14 ? 2 : 1;
  const labelFontSize = Math.max(8, size * 0.036);
  const periodLabels = highData.map((d, i) => {
    if (i % labelInterval !== 0) return null;
    const angleDeg = i * stepDeg;
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    const labelR = maxRadius + labelMargin * 0.55;
    const lx = cx + labelR * Math.cos(rad);
    const ly = cy + labelR * Math.sin(rad);
    return (
      <text
        key={`label-${i}`}
        x={lx}
        y={ly}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={labelFontSize}
        fill="var(--foreground)"
        aria-hidden="true"
      >
        {periodLabel(d.dateTime, totalCount)}
      </text>
    );
  });

  // Center label: max value
  const centerFontSize = Math.max(9, size * 0.036);

  return (
    <div
      className="relative"
      style={{ width: size, height: size, margin: '0 auto' }}
    >
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-labelledby={titleId}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Outer boundary */}
        {outerRing}

        {/* Concentric gridlines */}
        {gridLines}

        {/* Radial band segments */}
        {bands}

        {/* Focus ring — explicit SVG highlight replacing CSS outline (WCAG 2.4.7).
            Rendered on top with pointer-events disabled so it never blocks interaction. */}
        {focusedPathD && (
          <path
            d={focusedPathD}
            fill="none"
            stroke="var(--ring)"
            strokeWidth={2.5}
            aria-hidden="true"
            pointerEvents="none"
          />
        )}

        {/* Center: peak value summary */}
        <text
          x={cx}
          y={cy - centerFontSize * 0.6}
          textAnchor="middle"
          fontSize={centerFontSize * 0.8}
          fontWeight="bold"
          fill="var(--foreground)"
          aria-hidden="true"
        >
          {dataMax.toFixed(0)}{unit}
        </text>
        <text
          x={cx}
          y={cy + centerFontSize * 0.6}
          textAnchor="middle"
          fontSize={centerFontSize * 0.7}
          fill="var(--muted-foreground)"
          aria-hidden="true"
        >
          peak
        </text>

        {/* Period labels */}
        {periodLabels}
      </svg>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            left: tooltip.x + 12,
            top: tooltip.y - 8,
            pointerEvents: 'none',
            zIndex: 10,
          }}
          className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md"
        >
          <div className="font-semibold">{tooltip.label}</div>
          {tooltip.high !== null && (
            <div>High: {tooltip.high.toFixed(1)}{unit}</div>
          )}
          {tooltip.low !== null && (
            <div>Low: {tooltip.low.toFixed(1)}{unit}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function HaysChart({
  highData,
  lowData,
  field,
  unit = '',
  softMax,
  height = 300,
  reducedMotion = false,
}: HaysChartProps) {
  const id = useId();
  const titleId = `hays-chart-title-${id}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  // Square chart: the smaller of container width and requested height
  const chartSize = Math.min(containerWidth, height);

  if (highData.length === 0) {
    return null;
  }

  // Merge high and low for the accessible table — aligned by index
  const tableRows = highData.map((h, i) => ({
    dateTime: h.dateTime,
    high: h.value,
    low: lowData[i]?.value ?? null,
  }));

  const totalCount = highData.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Visually-hidden title consumed by the SVG's aria-labelledby (WCAG 1.1.1) */}
      <span id={titleId} className="sr-only">
        Polar arearange chart for {field}.
        Each position around the circle represents a time period.
        Each band spans from the low value to the high value for that period.
        See the accessible data table below for all values.
      </span>

      {/* Responsive container — ResizeObserver reads its width */}
      <div ref={containerRef} style={{ width: '100%', height }}>
        {chartSize > 0 && (
          <HaysChartSvg
            highData={highData}
            lowData={lowData}
            unit={unit}
            softMax={softMax}
            size={chartSize}
            reducedMotion={reducedMotion}
            titleId={titleId}
          />
        )}
      </div>

      {/* Color legend — pairs color with label text (WCAG 1.4.1, no color-only signal) */}
      <div
        className="flex items-center gap-2 justify-center text-xs text-muted-foreground"
        aria-label={`Color legend for ${field} chart`}
      >
        <span
          aria-hidden="true"
          className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
          style={{ backgroundColor: 'var(--primary)', opacity: 0.75 }}
        />
        <span>{field || 'Value'} range (low to high)</span>
      </div>

      {/* Screen-reader data table — wrapped in sr-only div because
          sr-only directly on <table> fails (table display overrides clip) */}
      <div className="sr-only">
      <table aria-label={`${field} range data`}>
        <caption>
          {field} high and low values for each period.
        </caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">High{unit ? ` (${unit})` : ''}</th>
            <th scope="col">Low{unit ? ` (${unit})` : ''}</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row, i) => (
            <tr key={i}>
              <th scope="row">{fullDateLabel(row.dateTime, totalCount)}</th>
              <td>{row.high !== null ? row.high.toFixed(1) : '—'}</td>
              <td>{row.low !== null ? row.low.toFixed(1) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
