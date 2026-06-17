// HourlyStrip.tsx — Scrollable horizontal hourly forecast strip (C3 Surface B).
//
// Two modes (controlled by threeHourWindows prop):
//   threeHourWindows=true  → filter to every 3rd hour; columns fill full width;
//                            no scroll; used on NowForecastCard Today tab.
//   threeHourWindows=false → all hours shown; horizontal scroll with visible
//                            scrollbar; used on ForecastHourlyCard.
//
// Layout mirrors C3-now-forecast-card.html and C3-forecast-page.html exactly:
//   Row order (top→bottom): time → icon → temp → trend → precip → wind
//
// Typography tokens:
//   Time:    Manrope 400, text-label (0.75rem), muted — both modes
//   Temp:    Outfit 600, text-stat-label (1rem) in threeHourWindows, text-label in scroll
//   Precip:  Manrope 400, text-label (0.75rem), muted — both modes
//   Wind:    WindSymbol size=24 in threeHourWindows, size=20 in scroll

import { useMemo } from 'react';
import { Drop, Snowflake } from '@phosphor-icons/react';
import { WeatherIcon } from '../weather-icon';
import { WindSymbol } from './WindSymbol';
import { TempTrendLine } from './TempTrendLine';
import { toWmoCode } from '../../utils/weather-code';
import { HorizontalScrollNav } from '../ui/horizontal-scroll-nav';
import type { HourlyForecastPoint, UnitsBlock } from '../../api/types';

// ── Time formatting ──────────────────────────────────────────────────────────

function formatHourLabel(isoString: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: true,
      timeZone: tz,
    }).format(new Date(isoString));
  } catch {
    return '';
  }
}

// ── Column cell styles ───────────────────────────────────────────────────────

const CELL_BASE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// ── Props ────────────────────────────────────────────────────────────────────

export interface HourlyStripProps {
  hours: HourlyForecastPoint[];
  /** When true, filter to every 3rd hour and fill full card width (no scroll). */
  threeHourWindows?: boolean;
  /** Station timezone, e.g. "America/New_York". Default "UTC". */
  stationTz?: string;
  /** When true, hide the temperature trend line between temp and precip rows. */
  hideTrend?: boolean;
  /** Units block from the API response — drives temp suffix. */
  units?: UnitsBlock | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export function HourlyStrip({
  hours,
  threeHourWindows = false,
  stationTz = 'UTC',
  hideTrend = false,
  units,
}: HourlyStripProps) {
  const tempSuffix = units?.outTemp ?? '°';

  // Select the data to display
  const displayHours = useMemo(() => {
    if (!threeHourWindows) return hours;
    // Filter to every 3rd hour (indices 0, 3, 6, …)
    return hours.filter((_, i) => i % 3 === 0);
  }, [hours, threeHourWindows]);

  const temps = useMemo(
    () => displayHours.map((h) => h.outTemp),
    [displayHours],
  );

  if (displayHours.length === 0) return null;

  // Column sizing:
  //   threeHourWindows → each col = 100% / N (fills full width)
  //   scrolling        → fixed 72px per column
  const colStyle: React.CSSProperties = threeHourWindows
    ? { flex: 1, minWidth: 0 }
    : { width: 72, flexShrink: 0 };

  // For threeHourWindows, the outer container is not a scroller; for scrolling
  // mode, HorizontalScrollNav owns the scroll container.
  const isScrollMode = !threeHourWindows;

  // ── Row heights ──────────────────────────────────────────────────────────
  // threeHourWindows: sized for the 2×2 card (22rem tall).
  //   Card content area ≈ 22rem – header(~2rem) – py padding(~1.5rem) ≈ 18.5rem ≈ 296px.
  //   Fixed row budget: time=20 + icon=40 + temp=24 + trend(48)+8 + precip=20 + wind=36 = 196px.
  //   Remaining ~100px is distributed as gaps via justifyContent:'space-between'.
  // scroll mode: forecast page heights (unchanged).
  const rowH = threeHourWindows
    ? { time: 20, icon: 40, temp: 24, precip: 20, wind: 36 }
    : { time: 18, icon: 34, temp: 22, precip: 18, wind: 42 };

  // ── Trend SVG: 48px for 2×2 card, 40px for page ─────────────────────────
  const trendH = threeHourWindows ? 48 : 40;

  // The trend line SVG spans the full width of ALL columns.
  // We render this as an absolutely-positioned overlay between temp and precip.
  // Since column layout is tricky with an overlay, we use a "table" row approach
  // where the strip is wrapped in a relative container and the trend SVG is placed
  // as a separate full-width row in the layout.

  // Actually, the cleanest approach matching the mockup exactly is to render
  // the strip as a flex-col of ROWS (not columns).  Each row is a flex-row of cells.
  // This matches the mockup's hourly-table / dc-row structure exactly.

  const N = displayHours.length;

  // Row: time labels
  const timeRow = displayHours.map((hour, i) => (
    <div
      key={i}
      style={{ ...colStyle, ...CELL_BASE, height: rowH.time }}
    >
      <span
        style={{
          fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
          fontSize: 'var(--text-label)',
          fontWeight: 600,
          color: 'var(--muted-foreground)',
          whiteSpace: 'nowrap',
        }}
      >
        {formatHourLabel(hour.validTime, stationTz)}
      </span>
    </div>
  ));

  // Row: weather icons
  const weatherIconSize = threeHourWindows ? 38 : 24;
  const iconRow = displayHours.map((hour, i) => (
    <div key={i} style={{ ...colStyle, ...CELL_BASE, height: rowH.icon }}>
      <WeatherIcon code={toWmoCode(hour.weatherCode)} size={weatherIconSize} />
    </div>
  ));

  // Row: temperatures
  const tempRow = displayHours.map((hour, i) => (
    <div key={i} style={{ ...colStyle, ...CELL_BASE, height: rowH.temp }}>
      <span
        style={{
          fontFamily: 'var(--font-display, Outfit, system-ui, sans-serif)',
          fontSize: threeHourWindows ? 'var(--text-stat-label)' : 'var(--text-label)',
          fontWeight: 600,
          color: 'var(--foreground)',
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}
      >
        {hour.outTemp !== null ? `${Math.round(hour.outTemp)}${tempSuffix}` : '—'}
      </span>
    </div>
  ));

  // Row: precipitation — always visible (0% shown muted, non-zero shown normal)
  const precipRow = displayHours.map((hour, i) => {
    const precip = hour.precipProbability;
    const isSnow = hour.precipType === 'snow';
    const PrecipIcon = isSnow ? Snowflake : Drop;
    return (
      <div key={i} style={{ ...colStyle, ...CELL_BASE, height: rowH.precip }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
            fontSize: threeHourWindows ? 'var(--text-label)' : 'var(--text-micro)',
            color: 'var(--muted-foreground)',
          }}
        >
          <PrecipIcon aria-hidden="true" size={threeHourWindows ? 13 : 9} />
          {precip !== null ? `${precip}%` : '—'}
        </span>
      </div>
    );
  });

  // Row: wind symbols
  const windRow = displayHours.map((hour, i) => {
    const bearing = hour.windDir ?? 0;
    const windSpeed = hour.windSpeed !== null ? Math.round(hour.windSpeed) : 0;
    return (
      <div key={i} style={{ ...colStyle, ...CELL_BASE, height: rowH.wind, overflow: 'visible' }}>
        <WindSymbol bearing={bearing} speed={windSpeed} size={threeHourWindows ? 24 : 20} />
      </div>
    );
  });

  // The SVG width calculation: for scrolling mode, use N*72; for fill mode, use N*100 (arbitrary units, viewBox-based)
  const svgViewWidth = isScrollMode ? N * 72 : N * 100;

  const tableContent = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: isScrollMode ? 'max-content' : '100%',
        minHeight: 0,
        // In fill mode (threeHourWindows), stretch to full height and spread rows
        // evenly so content occupies the full 22rem card height.
        ...(threeHourWindows ? { flex: 1, justifyContent: 'space-between' } : {}),
      }}
    >
      {/* Time row */}
      <div style={{ display: 'flex', flexDirection: 'row', width: '100%', marginBottom: threeHourWindows ? 1 : 0 }}>
        {timeRow}
      </div>
      {/* Icon row */}
      <div style={{ display: 'flex', flexDirection: 'row', width: '100%', marginBottom: threeHourWindows ? 1 : 0 }}>
        {iconRow}
      </div>
      {/* Temp row */}
      <div style={{ display: 'flex', flexDirection: 'row', width: '100%', marginBottom: threeHourWindows ? 2 : 0 }}>
        {tempRow}
      </div>
      {/* Trend line row — full-width SVG (hidden when hideTrend is set) */}
      {!hideTrend && (
        <div style={{ padding: threeHourWindows ? '2px 0 2px' : '3px 0 2px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <TempTrendLine
            highs={temps}
            mode="hourly"
            width={svgViewWidth}
            height={trendH}
          />
        </div>
      )}
      {/* Precip row */}
      <div style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
        {precipRow}
      </div>
      {/* Wind row */}
      <div style={{ display: 'flex', flexDirection: 'row', width: '100%', overflow: 'visible', marginTop: threeHourWindows ? 1 : 5 }}>
        {windRow}
      </div>
    </div>
  );

  if (isScrollMode) {
    return (
      <HorizontalScrollNav ariaLabel="Hourly forecast — scroll to see more">
        {tableContent}
      </HorizontalScrollNav>
    );
  }

  // Fill mode (threeHourWindows): no scroll container; stretches to fill the
  // parent flex column so rows distribute across the full 22rem card height.
  // Small top/bottom padding gives breathing room between the card title border
  // and the first time-label row, and between the wind row and the card bottom.
  return (
    <div
      role="list"
      aria-label="Hourly forecast"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
        paddingTop: '0.35rem',
        paddingBottom: '0.35rem',
      }}
    >
      {tableContent}
    </div>
  );
}

export default HourlyStrip;
