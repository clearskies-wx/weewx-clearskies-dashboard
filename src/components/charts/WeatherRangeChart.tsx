// WeatherRangeChart.tsx — T4.1
//
// Renders a custom SVG polar/radial chart showing high and low ranges for each
// time period (day-of-month or month). Each position around the circle
// represents a time period; each radial bar spans from the low value to the
// high value for that period.
//
// Accessibility (same pattern as WindRoseChart — WCAG 2.1 AA):
//   - SVG has role="img" + aria-labelledby pointing to a visually-hidden title
//   - sr-only <table> provides all values to screen readers (WCAG 1.1.1)
//   - Tooltip on hover/focus — each bar is keyboard-accessible via tabIndex
//   - Custom focus ring (SVG paths cannot use CSS :focus-visible with outline)
//   - CSS variables for all colors (both themes, light and dark)
//   - Reduced motion: no entry animations when reducedMotion prop is true
//   - Color gradient paired with position (not color-only state signal)
//
// Both themes: gradient interpolation uses explicit hex values; gridlines use
// var(--border); labels use var(--foreground) / var(--muted-foreground).

import { useState, useId, useCallback, useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WeatherRangeChartProps {
  highData: Array<{ dateTime: number; value: number | null }>;
  lowData: Array<{ dateTime: number; value: number | null }>;
  field: string;
  unit?: string;
  height?: number;
  reducedMotion?: boolean;
}

// ---------------------------------------------------------------------------
// Color helpers — cool (blue) → warm (red/orange) gradient
// Uses CSS variables --range-chart-cool/mid/warm for theme-awareness.
// ---------------------------------------------------------------------------

interface Rgb { r: number; g: number; b: number }

function parseHex(hex: string): Rgb {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

const FALLBACK_COOL = parseHex('#4a90d9');
const FALLBACK_MID  = parseHex('#f5a623');
const FALLBACK_WARM = parseHex('#d0021b');

function readRangeColors(): { cool: Rgb; mid: Rgb; warm: Rgb } {
  if (typeof document === 'undefined') return { cool: FALLBACK_COOL, mid: FALLBACK_MID, warm: FALLBACK_WARM };
  const style = getComputedStyle(document.documentElement);
  const coolStr = style.getPropertyValue('--range-chart-cool').trim();
  const midStr  = style.getPropertyValue('--range-chart-mid').trim();
  const warmStr = style.getPropertyValue('--range-chart-warm').trim();
  return {
    cool: coolStr ? parseHex(coolStr) : FALLBACK_COOL,
    mid:  midStr  ? parseHex(midStr)  : FALLBACK_MID,
    warm: warmStr ? parseHex(warmStr) : FALLBACK_WARM,
  };
}

function tempGradientColor(t: number, cool: Rgb, mid: Rgb, warm: Rgb): string {
  const c = Math.max(0, Math.min(1, t));
  let r: number, g: number, b: number;
  if (c < 0.5) {
    const u = c / 0.5;
    r = Math.round(cool.r + u * (mid.r - cool.r));
    g = Math.round(cool.g + u * (mid.g - cool.g));
    b = Math.round(cool.b + u * (mid.b - cool.b));
  } else {
    const u = (c - 0.5) / 0.5;
    r = Math.round(mid.r + u * (warm.r - mid.r));
    g = Math.round(mid.g + u * (warm.g - mid.g));
    b = Math.round(mid.b + u * (warm.b - mid.b));
  }
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Arc / radial bar path helper
// ---------------------------------------------------------------------------

/**
 * Returns an SVG path string for a radial bar (annular sector between two radii).
 * Angles are in degrees where 0 = top (12 o'clock), increasing clockwise.
 */
function radialBarPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number,
): string {
  if (outerR <= innerR || outerR <= 0 || innerR < 0) return '';

  function toRad(deg: number): number {
    return ((deg - 90) * Math.PI) / 180;
  }

  const s = toRad(startDeg);
  const e = toRad(endDeg);

  const ox1 = cx + outerR * Math.cos(s);
  const oy1 = cy + outerR * Math.sin(s);
  const ox2 = cx + outerR * Math.cos(e);
  const oy2 = cy + outerR * Math.sin(e);

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
// Container width hook (ResizeObserver) — mirrors WindRoseChart pattern
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
// Period label helpers
// ---------------------------------------------------------------------------

/**
 * Format a Unix timestamp (seconds) to a short period label.
 * For monthly data (12 points) returns month abbreviation; otherwise day number.
 */
function periodLabel(dateTime: number, totalCount: number): string {
  const d = new Date(dateTime * 1000);
  if (totalCount <= 12) {
    return d.toLocaleString('default', { month: 'short' });
  }
  return String(d.getDate());
}

/**
 * Format a Unix timestamp (seconds) to a full readable date string for the tooltip.
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

interface WeatherRangeSvgProps {
  highData: Array<{ dateTime: number; value: number | null }>;
  lowData: Array<{ dateTime: number; value: number | null }>;
  unit: string;
  size: number;
  reducedMotion: boolean;
  titleId: string;
}

function WeatherRangeSvg({
  highData,
  lowData,
  unit,
  size,
  reducedMotion,
  titleId,
}: WeatherRangeSvgProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const rangeColors = readRangeColors();

  const cx = size / 2;
  const cy = size / 2;

  // Label margin — space for period labels around the outside
  const labelMargin = Math.max(22, size * 0.09);
  const maxRadius = cx - labelMargin;

  // Compute global min/max across all data points (low min → center, high max → outer ring)
  const allValues: number[] = [];
  highData.forEach((d) => { if (d.value !== null) allValues.push(d.value); });
  lowData.forEach((d) => { if (d.value !== null) allValues.push(d.value); });

  const globalMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const globalMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  const range = globalMax - globalMin || 1;

  // Scale a value to a radius
  function valueToRadius(v: number): number {
    // Center = globalMin, outer ring = globalMax
    // Small padding at center so bars don't collapse to a point
    const minR = Math.max(4, size * 0.04);
    return minR + ((v - globalMin) / range) * (maxRadius - minR);
  }

  const totalCount = highData.length;
  if (totalCount === 0) return null;

  // Angular step per period
  const stepDeg = 360 / totalCount;
  // Gap between bars in degrees (narrow gap at high count)
  const gapDeg = totalCount > 20 ? 0.5 : 1.0;

  // Dismiss tooltip on Escape
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

  // Build radial bar segments
  const bars: React.ReactNode[] = [];
  let focusedPathD: string | null = null;

  for (let i = 0; i < totalCount; i++) {
    const highPoint = highData[i];
    const lowPoint = lowData[i] ?? highData[i]; // fall back to same point if no low data

    if (!highPoint || highPoint.value === null) continue;

    const highVal = highPoint.value;
    const lowVal = lowPoint.value ?? highVal;

    const innerR = valueToRadius(Math.min(highVal, lowVal));
    const outerR = valueToRadius(Math.max(highVal, lowVal));

    // Avoid zero-height bars (high === low)
    const actualOuter = Math.max(outerR, innerR + 1);

    const centerAngle = i * stepDeg;
    const startAngle = centerAngle - stepDeg / 2 + gapDeg / 2;
    const endAngle = centerAngle + stepDeg / 2 - gapDeg / 2;

    const pathD = radialBarPath(cx, cy, innerR, actualOuter, startAngle, endAngle);
    if (!pathD) continue;

    // Color: based on midpoint of high/low relative to global range
    const midVal = (highVal + lowVal) / 2;
    const colorT = (midVal - globalMin) / range;
    const color = tempGradientColor(colorT, rangeColors.cool, rangeColors.mid, rangeColors.warm);

    const label = fullDateLabel(highPoint.dateTime, totalCount);

    if (focusedIndex === i) {
      focusedPathD = pathD;
    }

    bars.push(
      <path
        key={i}
        d={pathD}
        fill={color}
        stroke="var(--background)"
        strokeWidth={0.5}
        tabIndex={0}
        aria-label={`${label}: high ${highVal.toFixed(1)}${unit}, low ${lowVal.toFixed(1)}${unit}`}
        style={{
          cursor: 'pointer',
          outline: 'none',
          transition: reducedMotion ? 'none' : 'opacity 0.12s ease',
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

  // Concentric gridlines — 4 evenly-spaced temperature rings with labels
  const GRID_COUNT = 4;
  const gridLines = Array.from({ length: GRID_COUNT }, (_, i) => {
    const fraction = (i + 1) / GRID_COUNT;
    const tempVal = globalMin + fraction * range;
    const minR = Math.max(4, size * 0.04);
    const r = minR + fraction * (maxRadius - minR);
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
          {tempVal.toFixed(0)}{unit}
        </text>
      </g>
    );
  });

  // Period labels around the perimeter
  // Only render every Nth label to avoid overlap when many periods exist
  const labelInterval = totalCount > 28 ? 7 : totalCount > 14 ? 2 : 1;
  const labelFontSize = Math.max(8, size * 0.036);
  const periodLabels = highData.map((d, i) => {
    if (i % labelInterval !== 0) return null;
    const angleDeg = i * stepDeg;
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    const labelR = maxRadius + labelMargin * 0.58;
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

  // Center label: global min and max
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
        {/* Outer boundary circle */}
        <circle
          cx={cx}
          cy={cy}
          r={maxRadius}
          fill="transparent"
          stroke="var(--border)"
          strokeWidth={1}
          aria-hidden="true"
        />

        {/* Gridlines */}
        {gridLines}

        {/* Radial bars */}
        {bars}

        {/* Focus ring — rendered on top; explicit SVG path focus indicator (WCAG 2.4.7) */}
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

        {/* Center summary */}
        <text
          x={cx}
          y={cy - centerFontSize * 0.7}
          textAnchor="middle"
          fontSize={centerFontSize * 0.8}
          fontWeight="bold"
          fill="var(--foreground)"
          aria-hidden="true"
        >
          {globalMax.toFixed(0)}{unit}
        </text>
        <text
          x={cx}
          y={cy + centerFontSize * 0.5}
          textAnchor="middle"
          fontSize={centerFontSize * 0.8}
          fill="var(--muted-foreground)"
          aria-hidden="true"
        >
          {globalMin.toFixed(0)}{unit}
        </text>

        {/* Period labels around perimeter */}
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

export function WeatherRangeChart({
  highData,
  lowData,
  field,
  unit = '',
  height = 300,
  reducedMotion = false,
}: WeatherRangeChartProps) {
  const id = useId();
  const titleId = `weather-range-title-${id}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  // Use the smaller of container width and requested height for a square chart
  const chartSize = Math.min(containerWidth, height);

  // Guard: no data to show
  if (highData.length === 0) {
    return null;
  }

  // Merge high and low data for the table — align by index
  const tableRows = highData.map((h, i) => ({
    dateTime: h.dateTime,
    high: h.value,
    low: lowData[i]?.value ?? null,
  }));

  const totalCount = highData.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Visually-hidden title consumed by SVG aria-labelledby (WCAG 1.1.1) */}
      <span id={titleId} className="sr-only">
        Radial range chart for {field}.
        Each position around the circle represents a time period.
        Each bar spans from the low value to the high value.
        See the accessible data table below for full values.
      </span>

      {/* Responsive container — ResizeObserver reads its width */}
      <div ref={containerRef} style={{ width: '100%', height }}>
        {chartSize > 0 && (
          <WeatherRangeSvg
            highData={highData}
            lowData={lowData}
            unit={unit}
            size={chartSize}
            reducedMotion={reducedMotion}
            titleId={titleId}
          />
        )}
      </div>

      {/* Color scale legend — pairs color with text, not color-only (WCAG 1.4.1) */}
      <div
        className="flex items-center gap-2 justify-center text-xs text-muted-foreground"
        aria-label="Color scale: cool (blue) to warm (red)"
      >
        <span aria-hidden="true" className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: 'var(--range-chart-cool)' }} />
        <span>Cool</span>
        <span
          aria-hidden="true"
          className="inline-block h-2 w-16 rounded-sm flex-shrink-0"
          style={{
            background: 'linear-gradient(to right, var(--range-chart-cool), var(--range-chart-mid), var(--range-chart-warm))',
          }}
        />
        <span>Warm</span>
        <span aria-hidden="true" className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: 'var(--range-chart-warm)' }} />
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
