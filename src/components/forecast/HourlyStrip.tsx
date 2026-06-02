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
// Typography tokens (LOCKED):
//   Time:    Manrope 400, text-label (0.75rem), muted
//   Temp:    Outfit 600, 0.85rem, foreground
//   Precip:  Manrope 400, text-micro (0.7rem), muted
//   Wind:    WindSymbol size=20

import { useMemo } from 'react';
import { Drop } from '@phosphor-icons/react';
import { WeatherIcon } from '../weather-icon';
import { WindSymbol } from './WindSymbol';
import { TempTrendLine } from './TempTrendLine';
import { toWmoCode } from '../../utils/weather-code';
import type { HourlyForecastPoint } from '../../api/types';

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
}

// ── Component ────────────────────────────────────────────────────────────────

export function HourlyStrip({
  hours,
  threeHourWindows = false,
  stationTz = 'UTC',
}: HourlyStripProps) {
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
    : { width: 72, flexShrink: 0, scrollSnapAlign: 'start' };

  // ── Scrollbar styles (Surface B — always visible) ────────────────────────
  const scrollerStyle: React.CSSProperties = threeHourWindows
    ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }
    : {
        overflowX: 'scroll',
        overflowY: 'hidden',
        paddingBottom: 8,
        scrollSnapType: 'x mandatory',
        flex: 1,
      };

  // For threeHourWindows, the outer container is not a scroller; for scrolling
  // mode, it IS the scroller and needs the styled scrollbar.
  const isScrollMode = !threeHourWindows;

  // ── Row heights match mockup ─────────────────────────────────────────────
  // threeHourWindows: compact card heights (from C3-now-forecast-card.html)
  // scroll mode:      forecast page heights (from C3-forecast-page.html)
  const rowH = threeHourWindows
    ? { time: 13, icon: 26, temp: 15, precip: 13, wind: 26 }
    : { time: 18, icon: 34, temp: 22, precip: 18, wind: 42 };

  // ── Trend SVG: 22px for compact, 40px for page ──────────────────────────
  const trendH = threeHourWindows ? 22 : 40;

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
          fontSize: 'var(--text-label, 0.75rem)',
          fontWeight: 400,
          color: 'var(--muted-foreground)',
          whiteSpace: 'nowrap',
        }}
      >
        {formatHourLabel(hour.validTime, stationTz)}
      </span>
    </div>
  ));

  // Row: weather icons
  const iconRow = displayHours.map((hour, i) => (
    <div key={i} style={{ ...colStyle, ...CELL_BASE, height: rowH.icon }}>
      <WeatherIcon code={toWmoCode(hour.weatherCode)} size={24} />
    </div>
  ));

  // Row: temperatures
  const tempRow = displayHours.map((hour, i) => (
    <div key={i} style={{ ...colStyle, ...CELL_BASE, height: rowH.temp }}>
      <span
        style={{
          fontFamily: 'var(--font-display, Outfit, system-ui, sans-serif)',
          fontSize: threeHourWindows ? '0.8rem' : '0.85rem',
          fontWeight: 600,
          color: 'var(--foreground)',
          letterSpacing: '-0.01em',
          lineHeight: 1,
        }}
      >
        {hour.outTemp !== null ? `${Math.round(hour.outTemp)}°` : '—'}
      </span>
    </div>
  ));

  // Row: precipitation — always visible (0% shown muted, non-zero shown normal)
  const precipRow = displayHours.map((hour, i) => {
    const precip = hour.precipProbability;
    const hasPrecip = precip !== null && precip > 0;
    return (
      <div key={i} style={{ ...colStyle, ...CELL_BASE, height: rowH.precip }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
            fontSize: 'var(--text-micro, 0.7rem)',
            color: 'var(--muted-foreground)',
            opacity: hasPrecip ? 1 : 0.5,
          }}
        >
          <Drop aria-hidden="true" size={7} />
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
        <WindSymbol bearing={bearing} speed={windSpeed} size={20} />
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
        flex: isScrollMode ? undefined : 1,
        minHeight: 0,
      }}
    >
      {/* Time row */}
      <div style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
        {timeRow}
      </div>
      {/* Icon row */}
      <div style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
        {iconRow}
      </div>
      {/* Temp row */}
      <div style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
        {tempRow}
      </div>
      {/* Trend line row — full-width SVG */}
      <div style={{ padding: '3px 0 2px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <TempTrendLine
          highs={temps}
          mode="hourly"
          width={svgViewWidth}
          height={trendH}
        />
      </div>
      {/* Precip row */}
      <div style={{ display: 'flex', flexDirection: 'row', width: '100%' }}>
        {precipRow}
      </div>
      {/* Wind row */}
      <div style={{ display: 'flex', flexDirection: 'row', width: '100%', overflow: 'visible' }}>
        {windRow}
      </div>
    </div>
  );

  if (isScrollMode) {
    return (
      <div
        role="list"
        tabIndex={0}
        aria-label="Hourly forecast — scroll to see more"
        style={{
          ...scrollerStyle,
          // Visible scrollbar styling via className below
        }}
        className="hourly-strip-scroller"
      >
        <style>{`
          .hourly-strip-scroller::-webkit-scrollbar { height: 7px; }
          .hourly-strip-scroller::-webkit-scrollbar-track {
            background: rgba(0,0,0,0.08); border-radius: 4px; margin: 0 2px;
          }
          .hourly-strip-scroller::-webkit-scrollbar-thumb {
            background: rgba(0,0,0,0.30); border-radius: 4px;
          }
          .hourly-strip-scroller::-webkit-scrollbar-thumb:hover {
            background: rgba(0,0,0,0.48);
          }
          [data-theme="dark"] .hourly-strip-scroller::-webkit-scrollbar-track {
            background: rgba(255,255,255,0.08);
          }
          [data-theme="dark"] .hourly-strip-scroller::-webkit-scrollbar-thumb {
            background: rgba(255,255,255,0.30);
          }
          [data-theme="dark"] .hourly-strip-scroller::-webkit-scrollbar-thumb:hover {
            background: rgba(255,255,255,0.50);
          }
        `}</style>
        {tableContent}
      </div>
    );
  }

  // Fill mode (threeHourWindows): no scroll container, fills available space
  return (
    <div
      role="list"
      aria-label="Hourly forecast"
      style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      {tableContent}
    </div>
  );
}

export default HourlyStrip;
