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
//   - Mobile: hi/lo temps stack vertically (flex-col) below md breakpoint
//
// expandable=false (now card 7-day tab):
//   - No accent bars, no dates, no expansion, simpler layout
//   - Mobile (< md): renders as stacked horizontal rows instead of columns
//   - Desktop (≥ md): standard column layout (trend line visible)

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Drop, Snowflake } from '@phosphor-icons/react';
import { WeatherIcon } from '../weather-icon';
import { WindSymbol } from './WindSymbol';
import { TempTrendLine } from './TempTrendLine';
import { toWmoCode } from '../../utils/weather-code';
import { addDays, isStationToday } from '../../utils/station-clock';
import type { DailyForecastPoint, UnitsBlock } from '../../api/types';

// ── Date helpers ─────────────────────────────────────────────────────────────

function getDayName(validDate: string, stationDate?: string): string {
  if (stationDate) {
    if (isStationToday(validDate, stationDate)) return 'Today';
    if (validDate === addDays(stationDate, 1)) return 'Tomorrow';
  }
  // Parse as UTC noon to avoid DST/timezone date shifting
  const d = new Date(validDate + 'T12:00:00Z');
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(d);
}

function getShortDayName(validDate: string, stationDate?: string): string {
  if (stationDate) {
    if (isStationToday(validDate, stationDate)) return 'Today';
    if (validDate === addDays(stationDate, 1)) return 'Tmrw';
  }
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
  /** Units block from the API response — drives suffixes in the detail panel. */
  units?: UnitsBlock;
  /** Station-local date (YYYY-MM-DD) from stationClock.date (ADR-075). Used to label
   *  Today / Tomorrow correctly — avoids the index===0 bug when providers roll data early. */
  stationDate?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function DailyColumns({
  days,
  expandable = false,
  stationTz = 'UTC',
  units,
  stationDate,
}: DailyColumnsProps) {
  const { t } = useTranslation('forecast');
  // Auto-select first column when expandable so users discover the detail panel.
  const [expandedIdx, setExpandedIdx] = useState<number | null>(expandable ? 0 : null);

  if (!days || days.length === 0) return null;

  const N = days.length;

  // Trend SVG sizes: 45px for forecast page, 65px for now card 2×2.
  // 65px gives the chart visual weight without dominating the card.
  const trendH = expandable ? 45 : 65;
  // SVG viewbox width: 700 units for N=7, proportional otherwise
  const svgViewWidth = 100 * N;

  const highs = days.map((d) => d.tempMax);
  const lows = days.map((d) => d.tempMin);

  // ── Unit suffixes from API units block ──────────────────────────────────
  const u = (field: string, fallback: string) => units?.[field] ?? fallback;
  const tempSuffix = u('dewpoint', '°');
  const precipSuffix = u('precipAmount', 'in');
  const snowSuffix = u('snow', precipSuffix);
  const windSuffix = u('windGustMax', 'mph');
  const visSuffix = u('windrun', 'mile') === 'mile' ? 'mi' : 'km';

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
        // expandable=false (now card): always short names (unchanged)
        // expandable=true (forecast page): short on mobile, full on desktop
        const dayName = expandable
          ? getDayName(day.validDate, stationDate)
          : getShortDayName(day.validDate, stationDate);
        const shortDayName = expandable ? getShortDayName(day.validDate, stationDate) : null;
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
              height: expandable ? 28 : 20,
              paddingTop: expandable ? 8 : 0,
              cursor: expandable ? 'pointer' : 'default',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
            }}
          >
            {expandable && shortDayName !== null ? (
              // Forecast page: short name on mobile, full name on desktop.
              // "Today" is the same in both — only one element rendered for it.
              shortDayName === dayName ? (
                // Index 0 ("Today") — same string both sizes, render once
                <span
                  style={{
                    fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                    fontSize: 'var(--text-secondary)',
                    fontWeight: 600,
                    color: isSelected ? 'var(--primary)' : 'var(--foreground)',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                  }}
                >
                  {dayName}
                </span>
              ) : (
                <>
                  {/* Short name: visible on mobile only */}
                  <span
                    className="md:hidden"
                    style={{
                      fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                      fontSize: 'var(--text-secondary)',
                      fontWeight: 600,
                      color: isSelected ? 'var(--primary)' : 'var(--foreground)',
                      whiteSpace: 'nowrap',
                      textAlign: 'center',
                    }}
                  >
                    {shortDayName}
                  </span>
                  {/* Full name: visible on desktop only */}
                  <span
                    className="hidden md:inline"
                    style={{
                      fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                      fontSize: 'var(--text-secondary)',
                      fontWeight: 600,
                      color: isSelected ? 'var(--primary)' : 'var(--foreground)',
                      whiteSpace: 'nowrap',
                      textAlign: 'center',
                    }}
                  >
                    {dayName}
                  </span>
                </>
              )
            ) : (
              // Now card (expandable=false): always short name, no dual rendering
              <span
                style={{
                  fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                  fontSize: 'var(--text-label)',
                  fontWeight: 600,
                  color: isSelected ? 'var(--primary)' : 'var(--foreground)',
                  whiteSpace: 'nowrap',
                  textAlign: 'center',
                }}
              >
                {dayName}
              </span>
            )}
            {dateLabel && (
              <span
                style={{
                  fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                  fontSize: 'var(--text-micro)',
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
            height: expandable ? 50 : 38,
            paddingTop: expandable ? 8 : 2,
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
          <WeatherIcon code={toWmoCode(day.weatherCode)} size={36} />
        </div>
      ))}
    </div>
  );

  // Hi/Lo row
  // expandable=true (forecast page): stack hi and lo vertically on mobile (< md).
  // expandable=false (now card): shown only in the desktop column layout (see mobileRows below).
  const hiloRow = (
    <div style={{ display: 'flex', flexDirection: 'row', position: 'relative', zIndex: 1 }}>
      {days.map((day, i) => (
        <div
          key={i}
          style={{
            ...cellBase,
            height: expandable ? 22 : 22,
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
          {expandable ? (
            // Forecast page: stack hi/lo vertically on mobile, inline on desktop
            <span
              style={{
                fontFamily: 'var(--font-display, Outfit, system-ui, sans-serif)',
                fontSize: 'var(--text-secondary)',
                fontWeight: 600,
                lineHeight: 1,
              }}
              className="flex flex-col items-center gap-0 md:flex-row md:items-baseline"
            >
              <span style={{ color: 'var(--temp-hi)' }}>
                {day.tempMax !== null ? `${Math.round(day.tempMax)}${tempSuffix}` : '—'}
              </span>
              <span
                style={{ color: 'var(--muted-foreground)', margin: '0 1px' }}
                className="hidden md:inline"
                aria-hidden="true"
              >
                /
              </span>
              <span style={{ color: 'var(--temp-lo)' }}>
                {day.tempMin !== null ? `${Math.round(day.tempMin)}${tempSuffix}` : '—'}
              </span>
            </span>
          ) : (
            // Now card: stack hi/lo vertically on mobile, inline on desktop
            <span
              style={{
                fontFamily: 'var(--font-display, Outfit, system-ui, sans-serif)',
                fontSize: 'var(--text-stat-label)',
                fontWeight: 600,
                lineHeight: 1,
              }}
              className="flex flex-col items-center gap-0 md:flex-row md:items-baseline"
            >
              <span style={{ color: 'var(--temp-hi)' }}>
                {day.tempMax !== null ? `${Math.round(day.tempMax)}${tempSuffix}` : '—'}
              </span>
              <span style={{ color: 'var(--muted-foreground)', margin: '0 1px' }} className="hidden md:inline" aria-hidden="true">/</span>
              <span style={{ color: 'var(--temp-lo)' }}>
                {day.tempMin !== null ? `${Math.round(day.tempMin)}${tempSuffix}` : '—'}
              </span>
            </span>
          )}
        </div>
      ))}
    </div>
  );

  // Precip row — always visible (0% shown muted, non-zero shown normal)
  // Amounts (precipAmount, snowAmount) are appended below the probability when > 0.
  // minHeight instead of fixed height allows the cell to grow when amounts are present.
  const precipRow = (
    <div style={{ display: 'flex', flexDirection: 'row', position: 'relative', zIndex: 1 }}>
      {days.map((day, i) => {
        const precip = day.precipProbabilityMax;
        return (
          <div key={i} style={{ ...cellBase, minHeight: 22, flexDirection: 'column' }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.08rem',
                fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                fontSize: expandable ? 'var(--text-micro)' : 'var(--text-label)',
                color: 'var(--muted-foreground)',
              }}
            >
              <Drop aria-hidden="true" size={expandable ? 8 : 12} />
              {precip !== null ? `${precip}%` : '—'}
            </span>
            {/* Rain amount — only when > 0 */}
            {day.precipAmount !== null && day.precipAmount > 0 && (
              <span
                style={{
                  fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                  fontSize: 'var(--text-micro)',
                  color: 'var(--muted-foreground)',
                  opacity: 0.8,
                }}
              >
                {day.precipAmount.toFixed(2)} {precipSuffix}
              </span>
            )}
            {/* Snow amount — only when > 0, with snowflake icon */}
            {day.snowAmount !== null && day.snowAmount > 0 && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.05rem',
                  fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
                  fontSize: 'var(--text-micro)',
                  color: 'var(--muted-foreground)',
                  opacity: 0.8,
                }}
              >
                <Snowflake aria-hidden="true" size={7} />
                {day.snowAmount.toFixed(1)} {snowSuffix}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );

  // Wind row
  const windRow = (
    <div style={{ display: 'flex', flexDirection: 'row', overflow: 'visible', position: 'relative', zIndex: 1, marginTop: expandable ? 0 : 1 }}>
      {days.map((day, i) => {
        const bearing = typeof day.extras?.windDir === 'number' ? day.extras.windDir : null;
        const windSpeed = day.windSpeedMax !== null ? Math.round(day.windSpeedMax) : 0;
        return (
          <div key={i} style={{ ...cellBase, height: expandable ? 44 : 28, overflow: 'visible' }}>
            <WindSymbol bearing={bearing} speed={windSpeed} size={expandable ? 20 : 24} />
          </div>
        );
      })}
    </div>
  );

  // Trend line row (full width).
  // flex:1 was removed from the non-expandable path — it dumped all remaining
  // card space into padding around a small chart while other rows were cramped.
  // Space is now distributed by justifyContent:'space-between' on the parent
  // flex column, so every inter-row gap is approximately equal.
  const trendRow = (
    <div style={{ padding: '3px 0 2px', display: 'flex', alignItems: 'center', position: 'relative', zIndex: 1 }}>
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
    const dayName = getDayName(day.validDate, stationDate);
    const dateLabel = getDateLabel(day.validDate);
    const sunrise = formatSunTime(day.sunrise, stationTz);
    const sunset = formatSunTime(day.sunset, stationTz);

    const selLeft = `${(expandedIdx / N) * 100}%`;
    const selRight = `${((expandedIdx + 1) / N) * 100}%`;

    // Reusable label/value chip — matches the existing gust/sunrise/sunset chip style.
    const chip = (label: string, value: string) => (
      <div
        key={label}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.3rem',
          fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
          fontSize: 'var(--text-card-title)',
        }}
      >
        <span style={{ fontSize: 'var(--text-micro)', color: 'var(--muted-foreground)', flexShrink: 0 }}>{label}</span>
        <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>{value}</span>
      </div>
    );

    const dewpointChip = (() => {
      const { dewpointMax, dewpointMin } = day;
      if (dewpointMax === null && dewpointMin === null) return null;
      const value =
        dewpointMax !== null && dewpointMin !== null
          ? `${Math.round(dewpointMin)}${tempSuffix} – ${Math.round(dewpointMax)}${tempSuffix}`
          : dewpointMax !== null
            ? `${Math.round(dewpointMax)}${tempSuffix}`
            : `${Math.round(dewpointMin!)}${tempSuffix}`;
      return chip(t('dewpoint'), value);
    })();

    // Humidity range: show "min% – max%" when both exist, single value otherwise.
    const humidityChip = (() => {
      const { humidityMax, humidityMin } = day;
      if (humidityMax === null && humidityMin === null) return null;
      const value =
        humidityMax !== null && humidityMin !== null
          ? `${Math.round(humidityMin)}% – ${Math.round(humidityMax)}%`
          : humidityMax !== null
            ? `${Math.round(humidityMax)}%`
            : `${Math.round(humidityMin!)}%`;
      return chip(t('humidity'), value);
    })();

    const anyStormRisk =
      (day.thunderRisk !== null && day.thunderRisk > 0) ||
      (day.tornadoRisk !== null && day.tornadoRisk > 0) ||
      (day.hailRisk !== null && day.hailRisk > 0) ||
      (day.windRisk !== null && day.windRisk > 0);

    return (
      <div
        style={{
          width: '100%',
          background: `linear-gradient(to right,
            var(--detail-panel-bg, rgba(80,100,255,0.08)) 0%,
            var(--detail-panel-bg, rgba(80,100,255,0.08)) ${selLeft},
            transparent ${selLeft},
            transparent ${selRight},
            var(--detail-panel-bg, rgba(80,100,255,0.08)) ${selRight},
            var(--detail-panel-bg, rgba(80,100,255,0.08)) 100%
          )`,
          borderRadius: '0 0 calc(0.875rem - 1px) calc(0.875rem - 1px)',
          padding: '0.75rem 1rem 1.25rem',
          flexShrink: 0,
          position: 'relative',
          zIndex: 1,
        }}
        aria-live="polite"
      >
        {/* Day header */}
        <div
          style={{
            fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
            fontSize: 'var(--text-card-title)',
            fontWeight: 600,
            color: 'var(--primary)',
            marginBottom: '0.45rem',
            opacity: 0.9,
          }}
        >
          {dayName}, {dateLabel}
        </div>

        {/* Narrative — full width, sits above the chip row */}
        {day.narrative && (
          <p
            style={{
              fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
              fontSize: 'var(--text-card-title)',
              color: 'var(--muted-foreground)',
              lineHeight: 1.55,
              fontStyle: 'italic',
              margin: '0 0 0.5rem',
            }}
          >
            {day.narrative}
          </p>
        )}

        {/* Chip grid — wrapping flex row of label/value pairs */}
        <div style={{ display: 'flex', flexDirection: 'row', columnGap: '1.5rem', rowGap: '0.35rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {dewpointChip}
          {humidityChip}
          {day.visibilityMax !== null && chip(t('visibility'), `${day.visibilityMax} ${visSuffix}`)}
          {day.uvIndexMax !== null && chip(t('uvIndex'), String(day.uvIndexMax))}
          {day.precipAmount !== null && day.precipAmount > 0 && chip(t('rain'), `${day.precipAmount} ${precipSuffix}`)}
          {day.snowAmount !== null && day.snowAmount > 0 && chip(t('snow'), `${day.snowAmount} ${snowSuffix}`)}
          {day.windGustMax !== null && chip(t('windGust'), `${Math.round(day.windGustMax)} ${windSuffix}`)}
          {sunrise !== '—' && chip(t('sunrise'), sunrise)}
          {sunset !== '—' && chip(t('sunset'), sunset)}
          {anyStormRisk && day.thunderRisk !== null && day.thunderRisk > 0 && chip(t('thunder'), String(day.thunderRisk))}
          {anyStormRisk && day.tornadoRisk !== null && day.tornadoRisk > 0 && chip(t('tornado'), String(day.tornadoRisk))}
          {anyStormRisk && day.hailRisk !== null && day.hailRisk > 0 && chip(t('hail'), String(day.hailRisk))}
          {anyStormRisk && day.windRisk !== null && day.windRisk > 0 && chip(t('windRisk'), String(day.windRisk))}
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
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        // Small top/bottom padding gives breathing room between the card title
        // border and the day-name row, and between the wind row and card bottom.
        ...(expandable ? {} : { paddingTop: '0.35rem', paddingBottom: '0.35rem' }),
      }}
    >
      {/* Column layout — always visible on all breakpoints.
          Hi/lo temps stack vertically on mobile via responsive classes in hiloRow.
          In non-expandable mode: the middle div stretches to fill full height and
          justifyContent:'space-between' distributes space proportionally across ALL
          rows — no single row absorbs all the extra space. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          overflow: 'visible',
          ...(expandable ? {} : { flex: 1, display: 'flex', flexDirection: 'column' }),
        }}
      >
        {selectedColBg}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            width: '100%',
            overflow: 'visible',
            ...(expandable
              ? { gap: 6 }
              : { flex: 1, justifyContent: 'space-between' }),
          }}
        >
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
