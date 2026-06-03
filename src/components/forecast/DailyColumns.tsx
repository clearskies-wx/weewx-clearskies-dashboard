// DailyColumns.tsx — 7-day column display with optional expansion (C3 Surface C).
//
// Layout mirrors C3-forecast-page.html buildDailyC() exactly:
//   Row order (top→bottom):
//     accent bar (3px, only when expandable)
//     day name + date (date only on forecast page)
//     weather icon
//     combined hi/lo temp
//     dual trend line (45px generous area for forecast page, 30px for now card)
//     precip
//     wind symbol
//
// expandable=true (forecast page):
//   - Click a column to expand it (accent top border + 8% blue tint background)
//   - One cohesive full-width detail panel below ALL columns (no borders/dividers)
//   - Detail panel: day header + wind gust + sunrise/sunset + narrative
//
// expandable=false (now card 7-day tab):
//   - No accent bars, no dates, no expansion, simpler layout

import { useState } from 'react';
import { Drop } from '@phosphor-icons/react';
import { WeatherIcon } from '../weather-icon';
import { WindSymbol } from './WindSymbol';
import { TempTrendLine } from './TempTrendLine';
import { toWmoCode } from '../../utils/weather-code';
import type { DailyForecastPoint } from '../../api/types';

// ── Date helpers ─────────────────────────────────────────────────────────────

function getDayName(validDate: string, index: number): string {
  if (index === 0) return 'Today';
  // Parse as UTC noon to avoid DST/timezone date shifting
  const d = new Date(validDate + 'T12:00:00Z');
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(d);
}

function getShortDayName(validDate: string, index: number): string {
  if (index === 0) return 'Today';
  const d = new Date(validDate + 'T12:00:00Z');
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(d);
}

function getDateLabel(validDate: string): string {
  const d = new Date(validDate + 'T12:00:00Z');
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

function formatSunTime(isoString: string | null, tz: string): string {
  if (!isoString) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    }).format(new Date(isoString));
  } catch {
    return '—';
  }
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface DailyColumnsProps {
  days: DailyForecastPoint[];
  /** When true: expandable with accent bar + detail panel. Used on forecast page. */
  expandable?: boolean;
  /** Station timezone. Default "UTC". */
  stationTz?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function DailyColumns({
  days,
  expandable = false,
  stationTz = 'UTC',
}: DailyColumnsProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (!days || days.length === 0) return null;

  const N = days.length;

  // Trend SVG sizes: 45px generous for forecast page, 35px for now card (C3 mockup)
  const trendH = expandable ? 45 : 25;
  // SVG viewbox width: 700 units for N=7, proportional otherwise
  const svgViewWidth = 100 * N;

  const highs = days.map((d) => d.tempMax);
  const lows = days.map((d) => d.tempMin);

  // ── Column click handler ─────────────────────────────────────────────────
  function handleColClick(idx: number) {
    if (!expandable) return;
    setExpandedIdx((prev) => (prev === idx ? null : idx));
  }

  // ── Common cell base style ───────────────────────────────────────────────
  const cellBase: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 0.1rem',
  };

  // ── Build rows ───────────────────────────────────────────────────────────

  // Accent bar row (expandable only)
  const accentBarRow = expandable ? (
    <div style={{ display: 'flex', flexDirection: 'row', height: 3, position: 'relative', zIndex: 1 }}>
      {days.map((_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 3,
            background: i === expandedIdx ? 'var(--primary)' : 'transparent',
          }}
        />
      ))}
    </div>
  ) : null;

  // Day name row
  const dayRow = (
    <div style={{ display: 'flex', flexDirection: 'row', position: 'relative', zIndex: 1 }}>
      {days.map((day, i) => {
        const isSelected = expandable && i === expandedIdx;
        const dayName = expandable
          ? getDayName(day.validDate, i)
          : getShortDayName(day.validDate, i);
        const dateLabel = expandable ? getDateLabel(day.validDate) : null;

        return (
          <div
            key={i}
            role={expandable ? 'button' : undefined}
            tabIndex={expandable ? 0 : undefined}
            aria-expanded={expandable ? i === expandedIdx : undefined}
            onClick={expandable ? () => handleColClick(i) : undefined}
            onKeyDown={expandable ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleColClick(i);
              }
            } : undefined}
            style={{
              ...cellBase,
              height: expandable ? 28 : 16,
              paddingTop: expandable ? 8 : 0,
              cursor: expandable ? 'pointer' : 'default',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                fontSize: expandable ? '0.85rem' : '0.66rem',
                fontWeight: 600,
                color: isSelected ? 'var(--primary)' : 'var(--foreground)',
                whiteSpace: 'nowrap',
                textAlign: 'center',
              }}
            >
              {dayName}
            </span>
            {dateLabel && (
              <span
                style={{
                  fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                  fontSize: '0.7rem',
                  color: 'var(--muted-foreground)',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                  display: 'block',
                }}
              >
                {dateLabel}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );

  // Icon row
  const iconRow = (
    <div style={{ display: 'flex', flexDirection: 'row', position: 'relative', zIndex: 1 }}>
      {days.map((day, i) => (
        <div
          key={i}
          style={{
            ...cellBase,
            height: expandable ? 40 : 26,
            paddingTop: expandable ? 6 : 3,
            cursor: expandable ? 'pointer' : 'default',
          }}
          onClick={expandable ? () => handleColClick(i) : undefined}
          onKeyDown={expandable ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleColClick(i);
            }
          } : undefined}
          role={expandable ? 'button' : undefined}
          tabIndex={expandable ? -1 : undefined}
          aria-hidden={expandable ? true : undefined}
        >
          <WeatherIcon code={toWmoCode(day.weatherCode)} size={24} />
        </div>
      ))}
    </div>
  );

  // Hi/Lo row
  const hiloRow = (
    <div style={{ display: 'flex', flexDirection: 'row', position: 'relative', zIndex: 1 }}>
      {days.map((day, i) => (
        <div
          key={i}
          style={{
            ...cellBase,
            height: expandable ? 22 : 16,
            cursor: expandable ? 'pointer' : 'default',
          }}
          onClick={expandable ? () => handleColClick(i) : undefined}
          onKeyDown={expandable ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleColClick(i);
            }
          } : undefined}
          role={expandable ? 'button' : undefined}
          tabIndex={expandable ? -1 : undefined}
          aria-hidden={expandable ? true : undefined}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 0,
              fontFamily: 'var(--font-display, Outfit, system-ui, sans-serif)',
              fontSize: expandable ? '0.85rem' : '0.75rem',
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            <span style={{ color: 'var(--temp-hi)' }}>
              {day.tempMax !== null ? `${Math.round(day.tempMax)}°` : '—'}
            </span>
            <span style={{ color: 'var(--muted-foreground)', margin: '0 1px' }}>/</span>
            <span style={{ color: 'var(--temp-lo)' }}>
              {day.tempMin !== null ? `${Math.round(day.tempMin)}°` : '—'}
            </span>
          </span>
        </div>
      ))}
    </div>
  );

  // Precip row — always visible (0% shown muted, non-zero shown normal)
  const precipRow = (
    <div style={{ display: 'flex', flexDirection: 'row', position: 'relative', zIndex: 1 }}>
      {days.map((day, i) => {
        const precip = day.precipProbabilityMax;
        return (
          <div key={i} style={{ ...cellBase, height: expandable ? 16 : 13, marginTop: expandable ? 0 : 0 }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.08rem',
                fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                fontSize: expandable ? 'var(--text-micro, 0.7rem)' : '0.66rem',
                color: 'var(--muted-foreground)',
                  }}
            >
              <Drop aria-hidden="true" size={expandable ? 8 : 7} />
              {precip !== null ? `${precip}%` : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );

  // Wind row
  const windRow = (
    <div style={{ display: 'flex', flexDirection: 'row', overflow: 'visible', position: 'relative', zIndex: 1, marginTop: expandable ? 0 : 5 }}>
      {days.map((day, i) => {
        const bearing = typeof day.extras?.windDir === 'number' ? day.extras.windDir : 0;
        const windSpeed = day.windSpeedMax !== null ? Math.round(day.windSpeedMax) : 0;
        return (
          <div key={i} style={{ ...cellBase, height: expandable ? 44 : 15, overflow: 'visible' }}>
            <WindSymbol bearing={bearing} speed={windSpeed} size={expandable ? 20 : 14} />
          </div>
        );
      })}
    </div>
  );

  // Trend line row (full width).
  // Uses flex:1 to fill remaining space per C3 mockup; padding 3px/2px matches mockup exactly.
  const trendRow = (
    <div style={{ padding: '3px 0 2px', flex: expandable ? undefined : 1, display: 'flex', alignItems: 'center', position: 'relative', zIndex: 1 }}>
      <TempTrendLine
        highs={highs}
        lows={lows}
        mode="daily"
        width={svgViewWidth}
        height={trendH}
      />
    </div>
  );

  // ── Expansion detail panel ───────────────────────────────────────────────
  const detailPanel = expandable && expandedIdx !== null ? (() => {
    const day = days[expandedIdx];
    const dayName = getDayName(day.validDate, expandedIdx);
    const dateLabel = getDateLabel(day.validDate);
    const gust = day.windGustMax !== null ? `${Math.round(day.windGustMax)} mph` : null;
    const sunrise = formatSunTime(day.sunrise, stationTz);
    const sunset = formatSunTime(day.sunset, stationTz);

    // Background gradient: transparent over the selected column, tinted everywhere else.
    // This creates the "seamless block" visual: selected col looks continuous with column background.
    const selLeft = `calc(${expandedIdx} / ${N} * 100%)`;
    const selRight = `calc(${expandedIdx + 1} / ${N} * 100%)`;

    return (
      <div
        style={{
          width: 'calc(100% + 2rem)',
          margin: '0 -1rem 0 -1rem',
          background: `linear-gradient(to right,
            var(--detail-panel-bg, rgba(80,100,255,0.08)) 0%,
            var(--detail-panel-bg, rgba(80,100,255,0.08)) ${selLeft},
            transparent ${selLeft},
            transparent ${selRight},
            var(--detail-panel-bg, rgba(80,100,255,0.08)) ${selRight},
            var(--detail-panel-bg, rgba(80,100,255,0.08)) 100%
          )`,
          borderRadius: '0 0 calc(0.875rem - 1px) calc(0.875rem - 1px)',
          padding: '0.5rem 1rem 0.85rem',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,
        }}
        aria-live="polite"
      >
        <div
          style={{
            fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'var(--primary)',
            marginBottom: '0.45rem',
            opacity: 0.9,
          }}
        >
          {dayName}, {dateLabel}
        </div>
        <div style={{ display: 'flex', flexDirection: 'row', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {gust && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem', fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)', fontSize: '0.82rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', flexShrink: 0 }}>Gust</span>
              <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{gust}</span>
            </div>
          )}
          {sunrise !== '—' && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem', fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)', fontSize: '0.82rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', flexShrink: 0 }}>Sunrise</span>
              <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{sunrise}</span>
            </div>
          )}
          {sunset !== '—' && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem', fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)', fontSize: '0.82rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', flexShrink: 0 }}>Sunset</span>
              <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{sunset}</span>
            </div>
          )}
          {day.narrative && (
            <p
              style={{
                fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                fontSize: '0.82rem',
                color: 'var(--muted-foreground)',
                lineHeight: 1.55,
                fontStyle: 'italic',
                flex: '1 1 200px',
                margin: 0,
              }}
            >
              {day.narrative}
            </p>
          )}
        </div>
      </div>
    );
  })() : null;

  // ── Continuous selected-column background overlay ────────────────────────
  const selectedColBg = expandable && expandedIdx !== null ? (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: `${(expandedIdx / N) * 100}%`,
        width: `${(1 / N) * 100}%`,
        background: 'var(--detail-panel-bg, rgba(80,100,255,0.08))',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  ) : null;

  return (
    <div
      // For the now-card (non-expandable): flex:1 + min-height:0 + overflow:hidden keeps
      // the component within CardContent's flex constraints (11rem grid row). Wind tails
      // use overflow:visible on their own row — card has overflow:hidden at the card level.
      // For the forecast page (expandable): overflow:visible so the detail panel can extend.
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: expandable ? 'visible' : 'hidden',
      }}
    >
      <div style={{ position: 'relative', width: '100%', overflow: 'visible' }}>
        {selectedColBg}
        <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', width: '100%', overflow: 'visible' }}>
          {accentBarRow}
          {dayRow}
          {iconRow}
          {hiloRow}
          {trendRow}
          {precipRow}
          {windRow}
        </div>
        {detailPanel}
      </div>
    </div>
  );
}

export default DailyColumns;
