// aqi-card.tsx — AQI tile component for the Now page.
//
// Renders a semi-circular gauge (SemiCircularGauge, shared with Barometer tile) showing
// the current Air Quality Index (AQI), with value, category, and main pollutant displayed
// inside the gauge arc.  A compact pollutant column on the right shows PM2.5, PM10,
// O3, NO2, SO2, and CO readings.
//
// Design:
//   - Card footprint "tile" (1 column).
//   - Title: "AQI" — text-only, Manrope 600 per design token.
//   - Layout: gauge occupies 62% of content width (left), pollutant column 38% (right).
//   - Gauge: gradient fill using EPA severity color bands (ADR-048 tracked gap — not tokenized).
//   - Children slot inside gauge: Phosphor leaf (inline SVG, outline/regular style) + AQI value
//     (18px Outfit 600) + category label (12px Manrope 600) + main pollutant (9px Manrope 400 muted).
//   - Pollutant column: severity dot (5px) + pollutant name (10px Manrope 400 muted) + value
//     (10px Outfit 600), tight row spacing.
//
// A11y (WCAG 2.1 AA):
//   - SVG title summarises gauge state for screen readers.
//   - aria-live="polite" on the gauge children container for SSE live updates.
//   - Category and pollutant conveyed by BOTH text and colored dot — not color alone (§5.1).
//   - Leaf icon is aria-hidden (decorative); text labels carry accessible meaning.
//   - Card uses aria-busy during loading.
//   - EPA dot colors: "Good" green (#1A7A1A) meets 4.5:1 on white; dark-mode dot contrast
//     verified at 3:1 against --card-glass backgrounds (dot is a non-text UI element).
//
// Color note (ADR-048):
//   EPA band colors for GAUGE FILL use the raw EPA palette (#00e400, #ffff00, etc.) because
//   they render against the dark arc track.  EPA dot colors in the POLLUTANT COLUMN use
//   AA-accessible shades (e.g. #1A7A1A for Good) to meet 4.5:1 contrast against the card
//   background.  The gauge fill colors are for visual encoding against a near-black track and
//   are decorative non-text elements (WCAG requires 3:1 for non-text UI, but unfilled ticks
//   are grey so only filled ticks carry the color, which is paired with position for state).

import { useTranslation } from 'react-i18next';
import { SemiCircularGauge } from './ui/semi-circular-gauge';
import type { ColorBand } from './ui/semi-circular-gauge';
import {
  Card,
  CardHeader,
  CardContent,
} from './ui/card';
import type { AQIReading } from '../api/types';

// ---------------------------------------------------------------------------
// EPA AQI color bands for the gauge fill (raw EPA palette — decorative encoding)
// Tick color assignment: each filled tick takes the color of the EPA band its
// scale-position falls within.  Unfilled ticks are always --gauge-unfill (grey).
// ---------------------------------------------------------------------------

const EPA_GAUGE_COLOR_BANDS: ColorBand[] = [
  { from: 0,   to: 50,  color: '#00e400' },
  { from: 50,  to: 100, color: '#ffff00' },
  { from: 100, to: 150, color: '#ff7e00' },
  { from: 150, to: 200, color: '#ff0000' },
  { from: 200, to: 300, color: '#8f3f97' },
  { from: 300, to: 500, color: '#7e0023' },
];

// ---------------------------------------------------------------------------
// EPA AQI dot colors for pollutant column — AA-accessible shades
// These render on card-glass backgrounds and must meet 4.5:1 for normal text
// and 3:1 for non-text UI elements.  The colored dot is a non-text indicator
// (requires 3:1) always paired with the pollutant name label (no color-only signal).
// ---------------------------------------------------------------------------

function aqiDotColor(value: number): string {
  // AA-accessible darkened EPA palette for use against light card backgrounds.
  // The corresponding raw EPA colors are in EPA_GAUGE_COLOR_BANDS above.
  if (value <= 50)  return '#1A7A1A';   // Good — accessible green
  if (value <= 100) return '#B8A000';   // Moderate — accessible yellow-gold
  if (value <= 150) return '#C45E00';   // Unhealthy for Sensitive Groups — accessible orange
  if (value <= 200) return '#CC0000';   // Unhealthy — accessible red
  if (value <= 300) return '#6B2D8B';   // Very Unhealthy — accessible purple
  return '#7E0023';                     // Hazardous — accessible maroon
}

// ---------------------------------------------------------------------------
// EPA AQI category label (no i18n dependency — used for SVG accessible title
// and exported for callers that need an English-only category string).
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
// Phosphor Leaf (Regular) inline SVG path — 256×256 viewBox
// Source: Phosphor Icons "leaf" regular style (outline).
// Used decoratively inside the gauge; aria-hidden.
// ---------------------------------------------------------------------------

const LEAF_PATH =
  'M223.45,40.07a8,8,0,0,0-7.52-7.52C139.8,28.08,78.82,51,52.82,94a87.09,87.09,0,0,0-12.76,49c.57,15.92,5.21,32,13.79,47.85l-19.51,19.5a8,8,0,0,0,11.32,11.32l19.5-19.51C81,210.73,97.09,215.37,113,215.94q1.67.06,3.33.06A86.93,86.93,0,0,0,162,203.18C205,177.18,227.93,116.21,223.45,40.07ZM153.75,189.5c-22.75,13.78-49.68,14-76.71.77l88.63-88.62a8,8,0,0,0-11.32-11.32L65.73,179c-13.19-27-13-54,.77-76.71,22.09-36.47,74.6-56.44,141.31-54.06C210.2,114.89,190.22,167.41,153.75,189.5Z';

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
    <div role="alert" className="flex flex-col gap-2 items-start text-sm">
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
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
  aqiValue: number;
  category: string;
  mainPollutant: string | null;
}

function GaugeContent({ aqiValue, category, mainPollutant }: GaugeContentProps) {
  return (
    // aria-live="polite" — SSE live updates announced to screen readers (ADR-041).
    // The SVG title on the gauge carries the full accessible summary;
    // this live region announces numeric changes without re-reading the full title.
    <div
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.15rem',
        pointerEvents: 'none',
      }}
    >
      {/* Leaf icon + AQI value — inline flex row so the icon sits left of the number */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
        }}
      >
        {/* Phosphor Leaf (Regular) — decorative; aria-hidden */}
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 256 256"
          // Height matches the value text block (~18px Outfit 600 + line-height).
          // Width scales proportionally from the 256×256 viewBox.
          style={{ width: '18px', height: '18px', flexShrink: 0 }}
          fill="currentColor"
        >
          <path d={LEAF_PATH} />
        </svg>

        {/* AQI numeric value — Outfit 600 18px */}
        <span
          style={{
            fontFamily: 'var(--font-display, system-ui, sans-serif)',
            fontWeight: 600,
            fontSize: '1.125rem',     // 18px
            color: 'var(--foreground)',
            letterSpacing: '-0.01em',
            fontFeatureSettings: '"tnum"',
            lineHeight: 1,
          }}
        >
          {aqiValue}
        </span>
      </div>

      {/* AQI category — Manrope 600 12px */}
      <span
        style={{
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
          fontWeight: 600,
          fontSize: '0.75rem',         // 12px
          color: 'var(--foreground)',
          lineHeight: 1.2,
          textAlign: 'center',
        }}
      >
        {category}
      </span>

      {/* Main pollutant — Manrope 400 9px muted */}
      {mainPollutant && (
        <span
          style={{
            fontFamily: 'var(--font-sans, system-ui, sans-serif)',
            fontWeight: 400,
            fontSize: '0.5625rem',     // 9px
            color: 'var(--muted-foreground)',
            lineHeight: 1.2,
            textAlign: 'center',
          }}
        >
          {mainPollutant}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pollutant row — severity dot + name + value
// ---------------------------------------------------------------------------

interface PollutantRowProps {
  name: string;
  value: number | null;
}

function PollutantRow({ name, value }: PollutantRowProps) {
  if (value === null) return null;
  const dotColor = aqiDotColor(value);

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
      {/* Pollutant name — Manrope 400 10px muted */}
      <span
        style={{
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
          fontWeight: 400,
          fontSize: '0.625rem',       // 10px
          color: 'var(--muted-foreground)',
          flexShrink: 0,
        }}
      >
        {name}
      </span>
      {/* Pollutant value — Outfit 600 10px */}
      <span
        style={{
          fontFamily: 'var(--font-display, system-ui, sans-serif)',
          fontWeight: 600,
          fontSize: '0.625rem',       // 10px
          color: 'var(--foreground)',
          marginLeft: 'auto',
          fontFeatureSettings: '"tnum"',
        }}
      >
        {value}
      </span>
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

export function AqiCard({
  aqi,
  loading = false,
  error = null,
  onRetry,
}: AqiCardProps) {
  const { t } = useTranslation('now');

  // Clamp AQI to [0, 500] for gauge positioning; treat null as 0 (gauge at min).
  const aqiValue = aqi?.aqi ?? null;
  const gaugeValue = aqiValue !== null ? Math.min(Math.max(aqiValue, 0), 500) : 0;

  // Category: prefer server-supplied string; fall back to band label.
  const category = aqi?.aqiCategory ?? (aqiValue !== null ? aqiCategoryLabel(aqiValue) : '—');

  // Main pollutant — server-supplied.
  const mainPollutant = aqi?.aqiMainPollutant ?? null;

  // SVG accessible title — summarises gauge state for screen readers.
  const svgTitle = aqi
    ? `${t('aqiCard.title')}: ${aqiValue ?? '—'}, ${category}${mainPollutant ? `, ${mainPollutant}` : ''}`
    : t('aqiCard.title');

  return (
    <Card footprint="tile" aria-busy={loading}>
      <CardHeader>
        {/* Title: text-only per spec.  Manrope 600 via font-heading. */}
        <h2 className="font-heading leading-snug font-semibold pb-1.5 border-b border-border" style={{ fontSize: 'var(--text-card-title, 0.82rem)' }}>
          {t('aqiCard.title')}
        </h2>
      </CardHeader>

      <CardContent
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        {loading ? (
          <>
            <span className="sr-only" role="status">{t('loading.airQuality')}</span>
            <AqiSkeleton />
          </>
        ) : error ? (
          <AqiError
            message={t('error.airQuality')}
            onRetry={onRetry ?? (() => undefined)}
          />
        ) : (
          (() => {
            const hasPollutants = [
              aqi?.pollutantPM25, aqi?.pollutantPM10, aqi?.pollutantO3,
              aqi?.pollutantNO2, aqi?.pollutantSO2, aqi?.pollutantCO,
            ].some(v => v !== null);

            return hasPollutants ? (
              /* Split layout: gauge left (62%) + pollutant column right (38%) */
              <div
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  gap: '0.5rem',
                  flex: 1,
                  minHeight: 0,
                }}
              >
                <div style={{ flex: '0 0 62%', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SemiCircularGauge
                    value={gaugeValue}
                    min={0}
                    max={500}
                    colorMode="gradient"
                    colorBands={EPA_GAUGE_COLOR_BANDS}
                    svgTitle={svgTitle}
                  >
                    <GaugeContent
                      aqiValue={aqiValue ?? 0}
                      category={category}
                      mainPollutant={mainPollutant}
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
                  <PollutantRow name="PM2.5" value={aqi?.pollutantPM25 ?? null} />
                  <PollutantRow name="PM10"  value={aqi?.pollutantPM10 ?? null} />
                  <PollutantRow name="O3"    value={aqi?.pollutantO3   ?? null} />
                  <PollutantRow name="NO2"   value={aqi?.pollutantNO2  ?? null} />
                  <PollutantRow name="SO2"   value={aqi?.pollutantSO2  ?? null} />
                  <PollutantRow name="CO"    value={aqi?.pollutantCO   ?? null} />
                </div>
              </div>
            ) : (
              /* No pollutant data (e.g. IQAir free tier) — gauge fills entire card */
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 0 }}>
                <SemiCircularGauge
                  value={gaugeValue}
                  min={0}
                  max={500}
                  colorMode="gradient"
                  colorBands={EPA_GAUGE_COLOR_BANDS}
                  svgTitle={svgTitle}
                >
                  <GaugeContent
                    aqiValue={aqiValue ?? 0}
                    category={category}
                    mainPollutant={mainPollutant}
                  />
                </SemiCircularGauge>
              </div>
            );
          })()
        )}
      </CardContent>
    </Card>
  );
}
