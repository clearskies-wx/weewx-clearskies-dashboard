// WindRoseChart.tsx — Phase 4 wind rose chart component.
//
// Renders a custom SVG polar chart showing wind direction frequency by
// Beaufort category. Sizing is handled via a ResizeObserver on the container div.
//
// Accessibility:
//   - SVG has role="img" + aria-labelledby pointing to a visually-hidden title
//   - sr-only <table> below the SVG provides all values to screen readers (WCAG 1.1.1)
//   - Tooltip on hover/focus of each segment (keyboard-accessible via tabIndex)
//   - Color is paired with category label in the legend (no color-only signals)
//   - CSS variables for gridlines and text (both themes)
//   - Reduced motion: no entry animations when reducedMotion prop is true
//
// Both themes: beaufortColors are explicit hex values (work in light and dark).
// Gridlines use var(--border); labels use var(--foreground).

import { useState, useId, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { WindRoseData } from '../../api/types';
import { formatNumber } from '../../utils/format-number';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fallback Beaufort palette matching Belchertown's beauford0–beauford6 defaults. */
const DEFAULT_BEAUFORT_COLORS: Record<number, string> = {
  0: '#1278c8', // Calm
  1: '#1fafdd', // Light Air
  2: '#71bc3c', // Light Breeze
  3: '#ffae00', // Gentle Breeze
  4: '#ff7f00', // Moderate Breeze
  5: '#ff4500', // Fresh Breeze
  6: '#9f00c5', // Strong Breeze+
};

/** Number of concentric gridline circles rendered. */
const GRID_CIRCLE_COUNT = 4;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WindRoseChartProps {
  data: WindRoseData;
  /** Beaufort colors keyed as string indices: {"0": "#hex", "1": "#hex", ...} */
  beaufortColors: Record<string, string>;
  height?: number;
  reducedMotion?: boolean;
  /** Optional chart title. Rendered as an <h3> matching the ConfigDrivenChart title pattern. Defaults to "Wind Rose". */
  title?: string | null;
}

// ---------------------------------------------------------------------------
// Arc path helper
// ---------------------------------------------------------------------------

/**
 * Returns an SVG path string for an annular sector (donut wedge).
 *
 * @param cx        Center x coordinate
 * @param cy        Center y coordinate
 * @param innerR    Inner radius of the sector
 * @param outerR    Outer radius of the sector
 * @param startDeg  Start angle in degrees (0 = North, clockwise positive)
 * @param endDeg    End angle in degrees
 */
function describeArc(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number,
): string {
  if (outerR <= innerR || outerR <= 0) return '';

  // Convert compass degrees (0=N, clockwise) to SVG coordinate angles.
  // SVG: x = cx + r*cos(θ), y = cy + r*sin(θ).
  // Compass 0=N maps to SVG -90deg; clockwise compass = clockwise SVG.
  function toRad(deg: number): number {
    return ((deg - 90) * Math.PI) / 180;
  }

  const s = toRad(startDeg);
  const e = toRad(endDeg);

  // Outer arc start and end points
  const ox1 = cx + outerR * Math.cos(s);
  const oy1 = cy + outerR * Math.sin(s);
  const ox2 = cx + outerR * Math.cos(e);
  const oy2 = cy + outerR * Math.sin(e);

  // Inner arc: traversed in reverse direction for the closing stroke
  const ix1 = cx + innerR * Math.cos(e);
  const iy1 = cy + innerR * Math.sin(e);
  const ix2 = cx + innerR * Math.cos(s);
  const iy2 = cy + innerR * Math.sin(s);

  // Large-arc flag: use 1 when the angle span is >= 180°
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
// Resolve Beaufort color
// ---------------------------------------------------------------------------

function resolveColor(
  beaufortIndex: number,
  beaufortColors: Record<string, string>,
): string {
  // Config keys are strings ("0", "1", ...); fall back to DEFAULT_BEAUFORT_COLORS.
  return (
    beaufortColors[String(beaufortIndex)] ??
    DEFAULT_BEAUFORT_COLORS[beaufortIndex] ??
    '#888888'
  );
}

// ---------------------------------------------------------------------------
// Tooltip state shape
// ---------------------------------------------------------------------------

interface TooltipState {
  direction: string;
  categoryLabel: string;
  percentage: number;
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Container width hook (ResizeObserver)
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
    // Initial measurement
    setWidth(el.getBoundingClientRect().width || 300);

    return () => observer.disconnect();
  }, [ref]);

  return width;
}

// ---------------------------------------------------------------------------
// Inner SVG chart
// ---------------------------------------------------------------------------

interface WindRoseSvgProps {
  data: WindRoseData;
  beaufortColors: Record<string, string>;
  size: number;
  reducedMotion: boolean;
  titleId: string;
}

function WindRoseSvg({
  data,
  beaufortColors,
  size,
  reducedMotion,
  titleId,
}: WindRoseSvgProps) {
  const { t, i18n } = useTranslation('charts');
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const cx = size / 2;
  const cy = size / 2;

  // Reserve margin for direction labels
  const labelMargin = Math.max(20, size * 0.08);
  const maxRadius = cx - labelMargin;

  // Determine the max cumulative percentage for gridline scaling.
  const maxCumulative = Math.max(
    ...data.bins.map((dirBin) => dirBin.reduce((a, b) => a + b, 0)),
    1, // guard against zero data
  );
  // Round up to nearest 5% for clean gridlines
  const gridMax = Math.ceil(maxCumulative / 5) * 5;

  // Scale: pixels per 1% of frequency
  const scale = maxRadius / gridMax;

  // Minimum inner radius so the center area stays clear
  const MIN_INNER_R = Math.max(4, size * 0.015);

  // Dismiss tooltip on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTooltip(null);
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

  const handlePointerEnter = useCallback(
    (
      e: React.PointerEvent<SVGPathElement>,
      direction: string,
      categoryLabel: string,
      percentage: number,
    ) => {
      const coords = getTooltipCoords(e.clientX, e.clientY);
      if (!coords) return;
      setTooltip({ direction, categoryLabel, percentage, ...coords });
    },
    [getTooltipCoords],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGPathElement>) => {
      const coords = getTooltipCoords(e.clientX, e.clientY);
      if (!coords) return;
      setTooltip((prev) => (prev ? { ...prev, ...coords } : prev));
    },
    [getTooltipCoords],
  );

  const handlePointerLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // Build arc path segments for each direction × category combination.
  // Also track path data for focused segment so we can draw a focus ring.
  const segments: React.ReactNode[] = [];
  let focusedPathD: string | null = null;

  data.directions.forEach((direction, dirIndex) => {
    const dirBin = data.bins[dirIndex];
    if (!dirBin) return;

    // Each direction spans 22.5° centered on its compass bearing
    const centerAngle = dirIndex * 22.5;
    const startAngle = centerAngle - 11.25;
    const endAngle = centerAngle + 11.25;

    let accumulatedR = MIN_INNER_R;

    data.categories.forEach((category, catIndex) => {
      const pct = dirBin[catIndex] ?? 0;
      if (pct <= 0) return;

      const segmentR = pct * scale;
      const innerR = accumulatedR;
      const outerR = accumulatedR + segmentR;
      accumulatedR = outerR;

      const color = resolveColor(category.beaufort, beaufortColors);
      const pathD = describeArc(cx, cy, innerR, outerR, startAngle, endAngle);
      if (!pathD) return;

      const segmentKey = `${dirIndex}-${catIndex}`;

      // Capture the path for the currently-focused segment focus ring
      if (focusedKey === segmentKey) {
        focusedPathD = pathD;
      }

      segments.push(
        <path
          key={segmentKey}
          d={pathD}
          fill={color}
          stroke="var(--background)"
          strokeWidth={0.5}
          tabIndex={0}
          role="img"
          aria-label={t('windRose.segmentAriaLabel', {
            direction,
            category: category.label,
            percentage: formatNumber(pct, 1, i18n.language),
          })}
          // Do NOT suppress outline globally — browser outline is suppressed only via
          // CSS :focus-visible is not available on SVG paths, so we render a custom
          // focus ring path in the focusRing layer below.
          style={{
            cursor: 'pointer',
            outline: 'none', // replaced by explicit focus ring rendered below
            transition: reducedMotion ? 'none' : 'opacity 0.15s ease',
          }}
          onPointerEnter={(e) =>
            handlePointerEnter(e, direction, category.label, pct)
          }
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          onFocus={(e) => {
            setFocusedKey(segmentKey);
            const rect = e.currentTarget.getBoundingClientRect();
            const svgRect = svgRef.current?.getBoundingClientRect();
            if (!svgRect) return;
            setTooltip({
              direction,
              categoryLabel: category.label,
              percentage: pct,
              x: rect.left + rect.width / 2 - svgRect.left,
              y: rect.top + rect.height / 2 - svgRect.top,
            });
          }}
          onBlur={() => {
            setFocusedKey(null);
            setTooltip(null);
          }}
        />,
      );
    });
  });

  // Concentric gridline circles at evenly-spaced percentage intervals
  const gridCircles = Array.from({ length: GRID_CIRCLE_COUNT }, (_, i) => {
    const pct = (gridMax / GRID_CIRCLE_COUNT) * (i + 1);
    const r = pct * scale;
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
          fontSize={Math.max(7, size * 0.028)}
          fill="var(--muted-foreground)"
          aria-hidden="true"
        >
          {t('windRose.percentValue', { value: formatNumber(Math.round(pct), 0, i18n.language) })}
        </text>
      </g>
    );
  });

  // Spoke lines for cardinal directions (N, E, S, W) as visual guides
  const spokes = [0, 90, 180, 270].map((angleDeg) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    const x2 = cx + maxRadius * Math.cos(rad);
    const y2 = cy + maxRadius * Math.sin(rad);
    return (
      <line
        key={`spoke-${angleDeg}`}
        x1={cx}
        y1={cy}
        x2={x2}
        y2={y2}
        stroke="var(--border)"
        strokeWidth={0.5}
        aria-hidden="true"
      />
    );
  });

  // Direction labels around the perimeter
  const labelFontSizeBase = Math.max(8, size * 0.04);
  const directionLabels = data.directions.map((label, i) => {
    const angleDeg = i * 22.5;
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    const labelR = maxRadius + labelMargin * 0.6;
    const lx = cx + labelR * Math.cos(rad);
    const ly = cy + labelR * Math.sin(rad);

    const isCardinal = i % 4 === 0;       // N, E, S, W
    const isIntercardinal = i % 2 === 0;  // NE, SE, SW, NW

    return (
      <text
        key={`label-${i}`}
        x={lx}
        y={ly}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={isCardinal ? labelFontSizeBase : isIntercardinal ? labelFontSizeBase * 0.8 : labelFontSizeBase * 0.65}
        fontWeight={isCardinal ? 'bold' : 'normal'}
        fill="var(--foreground)"
        aria-hidden="true"
      >
        {isCardinal || isIntercardinal ? label : '·'}
      </text>
    );
  });

  // Center calm percentage display
  const centerFontSize = Math.max(9, size * 0.038);

  return (
    <div className="relative" style={{ width: size, height: size, margin: '0 auto' }}>
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-labelledby={titleId}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Background circle border */}
        <circle
          cx={cx}
          cy={cy}
          r={maxRadius}
          fill="transparent"
          stroke="var(--border)"
          strokeWidth={1}
          aria-hidden="true"
        />

        {/* Concentric gridlines */}
        {gridCircles}

        {/* Spoke lines for cardinal directions */}
        {spokes}

        {/* Arc segments — rendered above gridlines */}
        {segments}

        {/* Focus ring: rendered on top of segments when a segment has keyboard focus.
            SVG <path> elements cannot use CSS :focus-visible with outline replacement,
            so we render an explicit highlight path to satisfy WCAG 2.4.7 Focus Visible.
            The ring uses the same path geometry with a contrasting stroke. */}
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

        {/* Center calm percentage */}
        <text
          x={cx}
          y={cy - centerFontSize * 0.6}
          textAnchor="middle"
          fontSize={centerFontSize}
          fontWeight="bold"
          fill="var(--foreground)"
          aria-hidden="true"
        >
          {t('windRose.percentValue', { value: formatNumber(data.calmPercentage, 1, i18n.language) })}
        </text>
        <text
          x={cx}
          y={cy + centerFontSize * 0.8}
          textAnchor="middle"
          fontSize={centerFontSize * 0.8}
          fill="var(--muted-foreground)"
          aria-hidden="true"
        >
          {t('windRose.calm')}
        </text>

        {/* Direction labels around perimeter */}
        {directionLabels}
      </svg>

      {/* Floating tooltip — positioned relative to the SVG container */}
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
          <div className="font-semibold">{tooltip.direction}</div>
          <div>{tooltip.categoryLabel}</div>
          <div>{t('windRose.percentValue', { value: formatNumber(tooltip.percentage, 1, i18n.language) })}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function WindRoseChart({
  data,
  beaufortColors,
  height = 300,
  reducedMotion = false,
  title,
}: WindRoseChartProps) {
  const { t, i18n } = useTranslation('charts');
  const id = useId();
  const titleId = `wind-rose-title-${id}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(containerRef);

  // Use the smaller of container width and requested height for a square chart
  const chartSize = Math.min(containerWidth, height);

  // Sanity guard: do not render with empty data
  if (
    !data ||
    data.directions.length === 0 ||
    data.categories.length === 0 ||
    data.bins.length === 0
  ) {
    return null;
  }

  // Resolved display title — operator config.title if provided, else "Wind Rose".
  const displayTitle = title ?? t('windRose.title');

  return (
    <div className="flex flex-col gap-4">
      {/* Visible chart title — matches ConfigDrivenChart h3 pattern */}
      <h3
        className="font-semibold text-foreground mb-2 text-center"
        style={{ fontSize: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}
      >
        {displayTitle}
      </h3>

      {/* Visually-hidden extended title consumed by the SVG's aria-labelledby */}
      <span id={titleId} className="sr-only">
        {t('windRose.srDescription', {
          calm: formatNumber(data.calmPercentage, 1, i18n.language),
          total: data.totalRecords,
        })}
      </span>

      {/* Responsive container div — ResizeObserver reads its width */}
      <div ref={containerRef} style={{ width: '100%', height }}>
        {chartSize > 0 && (
          <WindRoseSvg
            data={data}
            beaufortColors={beaufortColors}
            size={chartSize}
            reducedMotion={reducedMotion}
            titleId={titleId}
          />
        )}
      </div>

      {/* Legend: colored square + label. Not color-only. */}
      <div
        className="flex flex-wrap gap-x-4 gap-y-1 justify-center"
        aria-label={t('windRose.ariaLegend')}
      >
        {data.categories.map((category) => {
          const color = resolveColor(category.beaufort, beaufortColors);
          return (
            <div
              key={category.beaufort}
              className="flex items-center gap-1.5 text-foreground"
              style={{ fontSize: 'var(--text-label)' }}
            >
              <span
                aria-hidden="true"
                style={{ backgroundColor: color }}
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
              />
              <span>{category.label}</span>
            </div>
          );
        })}
      </div>

      {/* Screen-reader data table — wrapped in sr-only div because
          sr-only directly on <table> fails (table display overrides clip) */}
      <div className="sr-only">
      <table aria-label={t('windRose.ariaData')}>
        <caption>
          {t('windRose.tableCaption', {
            calm: formatNumber(data.calmPercentage, 1, i18n.language),
            total: data.totalRecords,
          })}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t('windRose.columnDirection')}</th>
            {data.categories.map((cat) => (
              <th key={cat.beaufort} scope="col">
                {t('windRose.columnCategory', { label: cat.label, beaufort: cat.beaufort })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.directions.map((direction, dirIndex) => (
            <tr key={direction}>
              <th scope="row">{direction}</th>
              {data.categories.map((cat, catIndex) => (
                <td key={cat.beaufort}>
                  {t('windRose.percentValue', {
                    value: formatNumber(data.bins[dirIndex]?.[catIndex] ?? 0, 1, i18n.language),
                  })}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row">{t('windRose.calmAllDirections')}</th>
            <td colSpan={data.categories.length}>
              {t('windRose.percentValue', { value: formatNumber(data.calmPercentage, 1, i18n.language) })}
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
}
