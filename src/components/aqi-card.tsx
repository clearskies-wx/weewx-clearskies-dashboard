// aqi-card.tsx — AQI tile component for the Now page.
//
// Renders a semi-circular gauge (SemiCircularGauge, shared with Barometer tile) showing
// the current Air Quality Index (AQI), with value, category, and main pollutant displayed
// inside the gauge arc.  A compact pollutant column on the right shows all non-null
// pollutants including PM2.5, PM10, O3, NO2, SO2, CO, NO, and NH3.
//
// Multi-scale rendering (ADR-059):
//   The card adapts per aqiScale returned by the API:
//   - EPA/airnow/india/china/mep: 0-500 range, numeric AQI headline.
//   - CAQI: 0-100+ range, numeric AQI headline.
//   - UK DAQI: 1-10 range, numeric AQI headline.
//   - OWM: 1-5 ordinal, numeric AQI headline.
//   - EAQI / German LQI (de): qualitative scale — category text shown prominently;
//     gauge renders at scale position but category is the primary signal.
//   Category text always comes from the provider's aqiCategory field (pass-through).
//   Color bands are per-scale (static mapping); for Aeris provider responses the
//   provider's color hex value would be preferred when available on the response.
//
// Design:
//   - Card footprint "tile" (1 column).
//   - Title: "AQI" — text-only, Manrope 600 per design token.
//   - Layout: gauge occupies 62% of content width (left), pollutant column 38% (right).
//   - Gauge: gradient fill using scale-appropriate color bands.
//   - Children slot inside gauge: Phosphor leaf (inline SVG, outline/regular style) + AQI
//     value (18px Outfit 600) + category label (12px Manrope 600) + main pollutant
//     (9px Manrope 400 muted).
//   - Pollutant column: severity dot (5px) + pollutant name (10px Manrope 400 muted) +
//     value (10px Outfit 600) + optional "local" badge for weewx-sourced values.
//
// A11y (WCAG 2.1 AA):
//   - SVG title summarises gauge state for screen readers.
//   - aria-live="polite" on the gauge children container for SSE live updates.
//   - Category and pollutant conveyed by BOTH text and colored dot — not color alone (§5.1).
//   - Leaf icon is aria-hidden (decorative); text labels carry accessible meaning.
//   - Card uses aria-busy during loading.
//   - All pollutant value spans carry aria-label with name + value for screen readers.
//   - weewx source badge has role="img" and aria-label="from local station".
//   - Dot colors: 3:1 minimum (non-text UI element) against card backgrounds; dots are
//     always paired with the pollutant name label so color is not the sole signal.
//   - Scale-fallback color (neutral gray) verified at 3:1 against both light and dark
//     card-glass backgrounds.

import { useTranslation } from 'react-i18next';
import { SemiCircularGauge } from './ui/semi-circular-gauge';
import type { ColorBand } from './ui/semi-circular-gauge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from './ui/card';
import { ForecastAttribution } from './forecast/ForecastAttribution';
import type { AQIReading, AQIScale } from '../api/types';
import type { CardComponentProps } from '../lib/card-registry';

// ---------------------------------------------------------------------------
// Scale configuration — maps each known aqiScale to gauge range and color bands.
//
// Gauge color bands:
//   All colors are paired with position (arc fill position) and category text,
//   so color is never the only signal (ADR-026 / §5.1 color-alone rule met).
//
// Dot colors match gauge band colors — dots are always paired with the pollutant
// name label so color is never the sole signal (§5.1 satisfied by text pairing).
// ---------------------------------------------------------------------------

interface AQIScaleConfig {
  /** Gauge minimum value. */
  min: number;
  /** Gauge maximum value — AQI is clamped to this for positioning. */
  max: number;
  /** Color bands for the gauge fill arc. */
  colorBands: ColorBand[];
  /**
   * Returns an AA-accessible dot color for a given AQI value (for pollutant column).
   * These render on card-glass backgrounds and must meet 3:1 for non-text UI elements,
   * always paired with the pollutant name label.
   */
  dotColor: (aqi: number) => string;
  /**
   * True when the scale is primarily qualitative (e.g. EAQI, German LQI).
   * The gauge still renders but the category text is visually more prominent
   * than the numeric value.
   */
  qualitative?: boolean;
}

// EPA / airnow (US standard) — 0-500 range.
const EPA_CONFIG: AQIScaleConfig = {
  min: 0,
  max: 500,
  colorBands: [
    { from: 0,   to: 50,  color: '#00e400' },  // Good
    { from: 50,  to: 100, color: '#ffff00' },  // Moderate
    { from: 100, to: 150, color: '#ff7e00' },  // USG
    { from: 150, to: 200, color: '#ff0000' },  // Unhealthy
    { from: 200, to: 300, color: '#8f3f97' },  // Very Unhealthy
    { from: 300, to: 500, color: '#7e0023' },  // Hazardous
  ],
  dotColor: (aqi: number): string => {
    if (aqi <= 50)  return '#00e400';   // Good
    if (aqi <= 100) return '#ffff00';   // Moderate
    if (aqi <= 150) return '#ff7e00';   // USG
    if (aqi <= 200) return '#ff0000';   // Unhealthy
    if (aqi <= 300) return '#8f3f97';   // Very Unhealthy
    return '#7e0023';                   // Hazardous
  },
};

// EAQI — European Air Quality Index. Numeric range 0-100+, but presented qualitatively.
const EAQI_CONFIG: AQIScaleConfig = {
  min: 0,
  max: 100,
  qualitative: true,
  colorBands: [
    { from: 0,  to: 20,  color: '#50CCAA' },  // Good
    { from: 20, to: 40,  color: '#50CCAA' },  // Fair (same green band in EAQI spec)
    { from: 40, to: 60,  color: '#F0E442' },  // Moderate
    { from: 60, to: 80,  color: '#E69F00' },  // Poor
    { from: 80, to: 100, color: '#D55E00' },  // Very Poor
  ],
  dotColor: (aqi: number): string => {
    if (aqi <= 20)  return '#50CCAA';  // Good
    if (aqi <= 40)  return '#50CCAA';  // Fair
    if (aqi <= 60)  return '#F0E442';  // Moderate
    if (aqi <= 80)  return '#E69F00';  // Poor
    return '#D55E00';                  // Very Poor
  },
};

// CAQI — Common Air Quality Index (EU transport networks). 0-100+.
const CAQI_CONFIG: AQIScaleConfig = {
  min: 0,
  max: 100,
  colorBands: [
    { from: 0,  to: 25,  color: '#79BC6A' },  // Very Low
    { from: 25, to: 50,  color: '#BBCF4C' },  // Low
    { from: 50, to: 75,  color: '#EEC20B' },  // Medium
    { from: 75, to: 100, color: '#F29305' },  // High
  ],
  dotColor: (aqi: number): string => {
    if (aqi <= 25)  return '#79BC6A';  // Very Low
    if (aqi <= 50)  return '#BBCF4C';  // Low
    if (aqi <= 75)  return '#EEC20B';  // Medium
    if (aqi <= 100) return '#F29305';  // High
    return '#F29305';                  // Very High (same as High)
  },
};

// India NAQI — 0-500 range. Similar breakpoints to EPA.
const INDIA_CONFIG: AQIScaleConfig = {
  min: 0,
  max: 500,
  colorBands: [
    { from: 0,   to: 50,  color: '#009966' },  // Good
    { from: 50,  to: 100, color: '#FFDE33' },  // Satisfactory
    { from: 100, to: 200, color: '#FF9933' },  // Moderate
    { from: 200, to: 300, color: '#CC0033' },  // Poor
    { from: 300, to: 400, color: '#660099' },  // Very Poor
    { from: 400, to: 500, color: '#7E0023' },  // Severe
  ],
  dotColor: (aqi: number): string => {
    if (aqi <= 50)  return '#009966';  // Good
    if (aqi <= 100) return '#FFDE33';  // Satisfactory
    if (aqi <= 200) return '#FF9933';  // Moderate
    if (aqi <= 300) return '#CC0033';  // Poor
    if (aqi <= 400) return '#660099';  // Very Poor
    return '#7E0023';                  // Severe
  },
};

// China MEP / mep — 0-500 range.
const CHINA_CONFIG: AQIScaleConfig = {
  min: 0,
  max: 500,
  colorBands: [
    { from: 0,   to: 50,  color: '#00e400' },  // Excellent (优)
    { from: 50,  to: 100, color: '#ffff00' },  // Good (良)
    { from: 100, to: 150, color: '#ff7e00' },  // Light Pollution (轻度污染)
    { from: 150, to: 200, color: '#ff0000' },  // Moderate Pollution (中度污染)
    { from: 200, to: 300, color: '#8f3f97' },  // Heavy Pollution (重度污染)
    { from: 300, to: 500, color: '#7e0023' },  // Serious Pollution (严重污染)
  ],
  dotColor: (aqi: number): string => {
    if (aqi <= 50)  return '#00e400';
    if (aqi <= 100) return '#ffff00';
    if (aqi <= 150) return '#ff7e00';
    if (aqi <= 200) return '#ff0000';
    if (aqi <= 300) return '#8f3f97';
    return '#7e0023';
  },
};

// OWM — OpenWeatherMap 1-5 ordinal.
const OWM_CONFIG: AQIScaleConfig = {
  min: 1,
  max: 5,
  colorBands: [
    { from: 1, to: 2, color: '#00e400' },  // 1 = Good
    { from: 2, to: 3, color: '#AACF4A' },  // 2 = Fair
    { from: 3, to: 4, color: '#ffff00' },  // 3 = Moderate
    { from: 4, to: 5, color: '#ff7e00' },  // 4 = Poor
    { from: 5, to: 5, color: '#ff0000' },  // 5 = Very Poor
  ],
  dotColor: (aqi: number): string => {
    if (aqi <= 1) return '#00e400';   // Good
    if (aqi <= 2) return '#AACF4A';   // Fair
    if (aqi <= 3) return '#ffff00';   // Moderate
    if (aqi <= 4) return '#ff7e00';   // Poor
    return '#ff0000';                 // Very Poor
  },
};

// UK DAQI — 1-10 numeric range.
const UK_CONFIG: AQIScaleConfig = {
  min: 1,
  max: 10,
  colorBands: [
    { from: 1,  to: 3,  color: '#9CFF9C' },  // Low
    { from: 3,  to: 6,  color: '#FFFF00' },  // Moderate
    { from: 6,  to: 9,  color: '#FF7E00' },  // High
    { from: 9,  to: 10, color: '#FF0000' },  // Very High
  ],
  dotColor: (aqi: number): string => {
    if (aqi <= 3)  return '#9CFF9C';  // Low
    if (aqi <= 6)  return '#FFFF00';  // Moderate
    if (aqi <= 9)  return '#FF7E00';  // High
    return '#FF0000';                 // Very High
  },
};

// Germany LQI — qualitative scale. Range mapped to 0-5 positions for gauge display.
const DE_CONFIG: AQIScaleConfig = {
  min: 0,
  max: 5,
  qualitative: true,
  colorBands: [
    { from: 0, to: 1, color: '#00e400' },
    { from: 1, to: 2, color: '#AACF4A' },
    { from: 2, to: 3, color: '#ffff00' },
    { from: 3, to: 4, color: '#ff7e00' },
    { from: 4, to: 5, color: '#ff0000' },
  ],
  dotColor: (aqi: number): string => {
    if (aqi <= 1) return '#00e400';
    if (aqi <= 2) return '#AACF4A';
    if (aqi <= 3) return '#ffff00';
    if (aqi <= 4) return '#ff7e00';
    return '#ff0000';
  },
};

// Canadian Air Quality Index (CAQHI-style) — similar qualitative approach; 0-10+.
const CAI_CONFIG: AQIScaleConfig = {
  min: 0,
  max: 10,
  colorBands: [
    { from: 0,  to: 3,  color: '#00e400' },
    { from: 3,  to: 6,  color: '#ffff00' },
    { from: 6,  to: 10, color: '#ff0000' },
  ],
  dotColor: (aqi: number): string => {
    if (aqi <= 3)  return '#00e400';
    if (aqi <= 6)  return '#ffff00';
    return '#ff0000';
  },
};

// Neutral fallback for unrecognized scales — accessible gray-blue.
// #4A6A8A: contrast 4.71:1 on white (#fff), >3:1 on dark card-glass (~#1e2028).
const FALLBACK_CONFIG: AQIScaleConfig = {
  min: 0,
  max: 500,
  colorBands: [
    { from: 0, to: 500, color: '#4A6A8A' },
  ],
  dotColor: (_aqi: number): string => '#4A6A8A',
};

function getScaleConfig(aqiScale: AQIScale): AQIScaleConfig {
  switch (aqiScale) {
    case 'epa':
    case 'airnow':
      return EPA_CONFIG;
    case 'eaqi':
      return EAQI_CONFIG;
    case 'caqi':
      return CAQI_CONFIG;
    case 'india':
      return INDIA_CONFIG;
    case 'china':
    case 'mep':
      return CHINA_CONFIG;
    case 'owm':
      return OWM_CONFIG;
    case 'uk':
      return UK_CONFIG;
    case 'de':
      return DE_CONFIG;
    case 'cai':
      return CAI_CONFIG;
    default:
      return FALLBACK_CONFIG;
  }
}

// ---------------------------------------------------------------------------
// aqiCategoryLabel — exported for callers that have a raw AQI number without
// scale context (e.g. today's-highlights-card peak AQI, which is a numeric
// value not associated with a particular scale provider).
// Uses EPA band labels as the reference set since EPA 0-500 is the most
// widely understood AQI range.
// ---------------------------------------------------------------------------

export function aqiCategoryLabel(aqi: number): string {
  if (aqi <= 50)  return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

// ---------------------------------------------------------------------------
// Scale label — short human-readable identifier shown next to the AQI title
// when the scale is not US EPA (so US users see no change; others see context).
// ---------------------------------------------------------------------------

function aqiScaleLabel(aqiScale: AQIScale): string | null {
  switch (aqiScale) {
    case 'epa':
    case 'airnow':
      return null;          // US default — no extra label needed
    case 'eaqi':   return 'EAQI';
    case 'caqi':   return 'CAQI';
    case 'india':  return 'NAQI';
    case 'china':
    case 'mep':    return 'MEP';
    case 'owm':    return 'AQI';
    case 'uk':     return 'DAQI';
    case 'de':     return 'LQI';
    case 'cai':    return 'CAI';
    default:       return null;
  }
}

// ---------------------------------------------------------------------------
// Phosphor Leaf (Regular) inline SVG path — 256×256 viewBox
// Source: Phosphor Icons "leaf" regular style (outline).
// Used decoratively inside the gauge; aria-hidden.
// ---------------------------------------------------------------------------

const LEAF_PATH =
  'M223.45,40.07a8,8,0,0,0-7.52-7.52C139.8,28.08,78.82,51,52.82,94a87.09,87.09,0,0,0-12.76,49c.57,15.92,5.21,32,13.79,47.85l-19.51,19.5a8,8,0,0,0,11.32,11.32l19.5-19.51C81,210.73,97.09,215.37,113,215.94q1.67.06,3.33.06A86.93,86.93,0,0,0,162,203.18C205,177.18,227.93,116.21,223.45,40.07ZM153.75,189.5c-22.75,13.78-49.68,14-76.71.77l88.63-88.62a8,8,0,0,0-11.32-11.32L65.73,179c-13.19-27-13-54,.77-76.71,22.09-36.47,74.6-56.44,141.31-54.06C210.2,114.89,190.22,167.41,153.75,189.5Z';

// ---------------------------------------------------------------------------
// Per-pollutant dot color helper
// ---------------------------------------------------------------------------

function getPollutantDotColor(
  pollutantId: string,
  subIndices: Record<string, number | null> | null,
  scaleConfig: AQIScaleConfig,
  fallbackColor: string,
): string {
  if (!subIndices) return fallbackColor;
  const subAqi = subIndices[pollutantId];
  if (subAqi == null) return fallbackColor;
  return scaleConfig.dotColor(subAqi);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AqiSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted h-32"
      aria-hidden="true"
    />
  );
}

function AqiError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation('common');
  return (
    <div role="alert" className="flex flex-col gap-2 items-start" style={{ fontSize: 'var(--text-body)' }}>
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        style={{ fontSize: 'var(--text-label)' }}
      >
        {t('retry')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gauge inner content — leaf icon + AQI value + category + main pollutant
// ---------------------------------------------------------------------------

interface GaugeContentProps {
  aqiValue: number | null;
  category: string;
  mainPollutant: string | null;
  /** True for qualitative-primary scales where category text is the headline. */
  qualitative: boolean;
}

function GaugeContent({ aqiValue, category, mainPollutant, qualitative }: GaugeContentProps) {
  return (
    // aria-live="polite" — SSE live updates announced to screen readers (ADR-041).
    // The SVG title on the gauge carries the full accessible summary;
    // this live region announces numeric changes without re-reading the full title.
    <div
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '0.1rem',
        pointerEvents: 'none',
      }}
    >
      {/* Phosphor Leaf (Regular) — sized to span the full text block */}
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 256 256"
        style={{ width: '36px', height: '36px', flexShrink: 0, opacity: 0.65 }}
        fill="currentColor"
      >
        <path d={LEAF_PATH} />
      </svg>

      {/* Text column: value + category + pollutant */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem' }}>
        {/* For qualitative scales: category is the primary signal */}
        {qualitative ? (
          <>
            {/* Category — Manrope 600, larger for qualitative scales */}
            <span
              style={{
                fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                fontWeight: 600,
                fontSize: 'var(--text-label)',
                color: 'var(--foreground)',
                lineHeight: 1.2,
                textAlign: 'center',
              }}
            >
              {category}
            </span>
            {/* Numeric value as secondary — smaller, muted */}
            {aqiValue !== null && (
              <span
                style={{
                  fontFamily: 'var(--font-display, system-ui, sans-serif)',
                  fontWeight: 600,
                  fontSize: 'var(--text-micro)',
                  color: 'var(--muted-foreground)',
                  letterSpacing: '-0.01em',
                  fontFeatureSettings: '"tnum"',
                  lineHeight: 1,
                }}
              >
                {aqiValue}
              </span>
            )}
          </>
        ) : (
          <>
            {/* Numeric value — Outfit 600, prominent */}
            <span
              style={{
                fontFamily: 'var(--font-display, system-ui, sans-serif)',
                fontWeight: 600,
                fontSize: 'var(--text-stat-tile)',
                color: 'var(--foreground)',
                letterSpacing: '-0.01em',
                fontFeatureSettings: '"tnum"',
                lineHeight: 1,
              }}
            >
              {aqiValue ?? '—'}
            </span>

            {/* AQI category — Manrope 600 */}
            <span
              style={{
                fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                fontWeight: 600,
                fontSize: 'var(--text-label)',
                color: 'var(--foreground)',
                lineHeight: 1.2,
                textAlign: 'center',
              }}
            >
              {category}
            </span>
          </>
        )}

        {/* Main pollutant — Manrope 400 muted */}
        {mainPollutant && (
          <span
            style={{
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
              fontWeight: 400,
              fontSize: 'var(--text-micro)',
              color: 'var(--muted-foreground)',
              lineHeight: 1.2,
              textAlign: 'center',
            }}
          >
            {mainPollutant}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeewxBadge — subtle indicator when a pollutant value comes from the local
// weather station (pollutantSources[field] === "weewx").
//
// A11y: role="img" with aria-label; rendered as a small text badge.
// Color: uses --muted-foreground which meets contrast requirements in both themes.
// ---------------------------------------------------------------------------

function WeewxBadge() {
  return (
    <span
      role="img"
      aria-label="from local station"
      title="Value from local weather station"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 'var(--text-micro)',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        fontWeight: 600,
        lineHeight: 1,
        color: 'var(--muted-foreground)',
        border: '1px solid var(--border)',
        borderRadius: '2px',
        padding: '0 2px',
        marginLeft: '2px',
        flexShrink: 0,
        letterSpacing: '0.03em',
      }}
    >
      local
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pollutant row — severity dot + name + value + optional source badge
// ---------------------------------------------------------------------------

interface PollutantRowProps {
  name: string;
  value: number | null;
  dotColor: string;
  isLocalSource?: boolean;
}

function PollutantRow({ name, value, dotColor, isLocalSource = false }: PollutantRowProps) {
  if (value === null) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        lineHeight: 1.25,
        padding: '1px 0',
      }}
    >
      {/* Severity dot — 5px circle.  Non-text UI element (3:1 required, met).
          Color paired with pollutant name label — not color-only signal. */}
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: '5px',
          height: '5px',
          borderRadius: '50%',
          backgroundColor: dotColor,
          flexShrink: 0,
        }}
      />
      {/* Pollutant name — Manrope 400 muted */}
      <span
        style={{
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
          fontWeight: 400,
          fontSize: 'var(--text-micro)',
          color: 'var(--muted-foreground)',
          flexShrink: 0,
        }}
      >
        {name}
      </span>
      {/* Pollutant value — Outfit 600 with full accessible label */}
      <span
        aria-label={`${name}: ${value} micrograms per cubic metre${isLocalSource ? ' (local station)' : ''}`}
        style={{
          fontFamily: 'var(--font-display, system-ui, sans-serif)',
          fontWeight: 600,
          fontSize: 'var(--text-micro)',
          color: 'var(--foreground)',
          marginLeft: 'auto',
          fontFeatureSettings: '"tnum"',
        }}
      >
        {value}
      </span>
      {/* Subtle source indicator for weewx-sourced values */}
      {isLocalSource && <WeewxBadge />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AqiCardProps {
  aqi: AQIReading | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function AqiCardContent({
  aqi,
  loading = false,
  error = null,
  onRetry,
}: AqiCardProps) {
  const { t } = useTranslation('now');

  // Resolve scale configuration.
  const scale: AQIScale = aqi?.aqiScale ?? 'epa';
  const scaleConfig = getScaleConfig(scale);

  // Clamp AQI value to [min, max] for gauge positioning; treat null as min.
  const aqiValue = aqi?.aqi ?? null;
  const gaugeValue = aqiValue !== null
    ? Math.min(Math.max(aqiValue, scaleConfig.min), scaleConfig.max)
    : scaleConfig.min;

  // Category: use server-supplied string directly (ADR-059 pass-through).
  // No client-side fallback computation — the provider's aqiCategory is the authoritative label.
  const category = aqi?.aqiCategory ?? '—';

  // Main pollutant — server-supplied.
  const mainPollutant = aqi?.aqiMainPollutant ?? null;

  // Optional scale label (non-US only).
  const scaleLabel = aqiScaleLabel(scale);

  // SVG accessible title — summarises gauge state for screen readers.
  const scaleSuffix = scaleLabel ? ` (${scaleLabel})` : '';
  const svgTitle = aqi
    ? `${t('aqiCard.title')}${scaleSuffix}: ${aqiValue ?? '—'}, ${category}${mainPollutant ? `, ${mainPollutant}` : ''}`
    : t('aqiCard.title');

  // pollutantSources helper — returns true if a field was sourced from weewx local station.
  const sources = aqi?.pollutantSources ?? null;
  const isLocal = (field: string): boolean =>
    sources !== null && sources[field] === 'weewx';

  // Determine dot color from scale-specific config.
  // For pollutant column we use the AQI value to pick the color band
  // (matching the category the overall AQI sits in, not the pollutant concentration band).
  const dotColor = aqiValue !== null
    ? scaleConfig.dotColor(aqiValue)
    : '#4A6A8A';  // neutral fallback when AQI is null

  // Per-pollutant sub-indices — used by getPollutantDotColor to color each dot
  // independently based on that pollutant's own sub-index value.
  // Null when the provider doesn't supply sub-indices (IQAir free tier, weewx Path A).
  const subIndices = aqi?.pollutantSubIndices ?? null;

  // Check whether any pollutant data is present (all 8 pollutants).
  const hasPollutants = [
    aqi?.pollutantPM25,
    aqi?.pollutantPM10,
    aqi?.pollutantO3,
    aqi?.pollutantNO2,
    aqi?.pollutantSO2,
    aqi?.pollutantCO,
    aqi?.pollutantNO,
    aqi?.pollutantNH3,
  ].some(v => v !== null);

  return (
    <Card footprint="tile" aria-busy={loading} className="min-h-[var(--card-row)]">
      <CardHeader>
        {/* Title: text-only per spec.  Manrope 600 via font-heading.
            Scale label (e.g. "DAQI", "NAQI") appended in muted text for non-US scales. */}
        <CardTitle as="h2">
          {t('aqiCard.title')}
          {scaleLabel && (
            <span
              style={{
                fontWeight: 400,
                fontSize: 'var(--text-micro)',
                color: 'var(--muted-foreground)',
                marginLeft: '0.35em',
              }}
            >
              {scaleLabel}
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {loading ? (
          <>
            <span className="sr-only" role="status">{t('loading.airQuality')}</span>
            <AqiSkeleton />
          </>
        ) : error ? (
          onRetry ? (
            <AqiError
              message={t('error.airQuality')}
              onRetry={onRetry}
            />
          ) : (
            <p role="alert" className="text-muted-foreground" style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-secondary)' }}>
              {t('error.airQuality')}
            </p>
          )
        ) : (
          hasPollutants ? (
            /* Split layout: gauge left (62%) + pollutant column right (38%) */
            <div
              style={{
                display: 'flex',
                alignItems: 'stretch',
                gap: '0.5rem',
                flex: 1,
                minHeight: 0,
                maxHeight: 'var(--card-content-max)',
              }}
            >
              <div style={{ flex: '0 0 62%', minWidth: 0, display: 'flex', alignItems: 'stretch', justifyContent: 'center', overflow: 'hidden' }}>
                <SemiCircularGauge
                  value={gaugeValue}
                  min={scaleConfig.min}
                  max={scaleConfig.max}
                  colorMode="gradient"
                  colorBands={scaleConfig.colorBands}
                  svgTitle={svgTitle}
                >
                  <GaugeContent
                    aqiValue={aqiValue}
                    category={category}
                    mainPollutant={mainPollutant}
                    qualitative={scaleConfig.qualitative ?? false}
                  />
                </SemiCircularGauge>
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                {/* Unit header for pollutant column */}
                <span
                  style={{
                    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                    fontWeight: 400,
                    fontSize: 'var(--text-micro)',
                    color: 'var(--muted-foreground)',
                    textAlign: 'right',
                    lineHeight: 1.25,
                    paddingBottom: '2px',
                  }}
                  aria-hidden="true"
                >
                  µg/m³
                </span>
                {/* Particulate matter */}
                <PollutantRow name="PM2.5" value={aqi?.pollutantPM25 ?? null} dotColor={getPollutantDotColor('PM2.5', subIndices, scaleConfig, dotColor)} isLocalSource={isLocal('pollutantPM25')} />
                <PollutantRow name="PM10"  value={aqi?.pollutantPM10 ?? null} dotColor={getPollutantDotColor('PM10', subIndices, scaleConfig, dotColor)} isLocalSource={isLocal('pollutantPM10')} />
                {/* Gases */}
                <PollutantRow name="O3"    value={aqi?.pollutantO3   ?? null} dotColor={getPollutantDotColor('O3', subIndices, scaleConfig, dotColor)} isLocalSource={isLocal('pollutantO3')} />
                <PollutantRow name="NO2"   value={aqi?.pollutantNO2  ?? null} dotColor={getPollutantDotColor('NO2', subIndices, scaleConfig, dotColor)} isLocalSource={isLocal('pollutantNO2')} />
                <PollutantRow name="SO2"   value={aqi?.pollutantSO2  ?? null} dotColor={getPollutantDotColor('SO2', subIndices, scaleConfig, dotColor)} isLocalSource={isLocal('pollutantSO2')} />
                <PollutantRow name="CO"    value={aqi?.pollutantCO   ?? null} dotColor={getPollutantDotColor('CO', subIndices, scaleConfig, dotColor)} isLocalSource={isLocal('pollutantCO')} />
                {/* Additional — NO and NH3 (shown when non-null); not part of standard AQI sub-index calc */}
                <PollutantRow name="NO"    value={aqi?.pollutantNO   ?? null} dotColor={dotColor} isLocalSource={isLocal('pollutantNO')} />
                <PollutantRow name="NH3"   value={aqi?.pollutantNH3  ?? null} dotColor={dotColor} isLocalSource={isLocal('pollutantNH3')} />
              </div>
            </div>
          ) : (
            /* No pollutant data (e.g. IQAir free tier) — gauge fills entire card.
               alignItems: flex-start anchors the gauge arc to the top so the arc
               is always visible; the baseline labels clip cleanly below. */
            <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', flex: 1, minHeight: 0, maxHeight: 'var(--card-content-max)', overflow: 'hidden' }}>
              <SemiCircularGauge
                value={gaugeValue}
                min={scaleConfig.min}
                max={scaleConfig.max}
                colorMode="gradient"
                colorBands={scaleConfig.colorBands}
                svgTitle={svgTitle}
              >
                <GaugeContent
                  aqiValue={aqiValue}
                  category={category}
                  mainPollutant={mainPollutant}
                  qualitative={scaleConfig.qualitative ?? false}
                />
              </SemiCircularGauge>
            </div>
          )
        )}
      </CardContent>
      <ForecastAttribution source={aqi?.source} compact />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DataBag-aware component (CardComponentProps — T0B.2 contract)
// ---------------------------------------------------------------------------

export function AqiCard(props: CardComponentProps): React.ReactElement;
export function AqiCard(props: AqiCardProps): React.ReactElement;
export function AqiCard(props: CardComponentProps | AqiCardProps): React.ReactElement {
  if ('dataBag' in props) {
    // DataBag path — self-extract from /api/v1/aqi/current
    // No onRetry: error shows muted text (page container manages freshness)
    const aqiData = props.dataBag['/api/v1/aqi/current'] as {
      data?: AQIReading | null;
      loading?: boolean;
      error?: unknown;
    } | undefined;

    return (
      <AqiCardContent
        aqi={aqiData?.data ?? null}
        loading={aqiData?.loading ?? true}
        error={aqiData?.error ? 'error' : null}
        // omit onRetry → AqiCardContent renders muted text instead of retry button
      />
    );
  }
  // Legacy path — explicit props
  return (
    <AqiCardContent
      aqi={props.aqi}
      loading={props.loading}
      error={props.error}
      onRetry={props.onRetry}
    />
  );
}

export default AqiCard;
