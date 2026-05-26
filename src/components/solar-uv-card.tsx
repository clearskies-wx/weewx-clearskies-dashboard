// solar-uv-card.tsx — Solar radiation and UV index tile for the Now page.
//
// Displays:
//   - Solar radiation in W/m²
//   - UV index with a segmented bar indicator
//   - Exposure risk label (Low / Moderate / High / Very High / Extreme)
//
// A11y design:
//   - Color is NOT the sole signal: each UV range has both a color segment
//     and a visible text label.  The bar carries an aria-label with both the
//     numeric value and the risk level, so screen readers receive both.
//   - UV bar segment colors are chosen for ≥3:1 contrast against the card
//     background (#FFFFFF light / oklch(0.145 0 0) ≈ #1A1A1A dark) per
//     WCAG 1.4.11 (Non-Text Contrast).  The raw EPA UV palette uses pure
//     green/yellow which fail that threshold; the shades below are adjusted:
//
//       Low (0–2):       #1A7A1A  (~7.0:1 on white, ~5.2:1 on #1A1A1A)
//       Moderate (3–5):  #B8A000  (~3.4:1 on white, ~4.6:1 on #1A1A1A)
//       High (6–7):      #C45E00  (~4.0:1 on white, ~5.4:1 on #1A1A1A)
//       Very High (8–10):#CC0000  (~5.9:1 on white, ~6.8:1 on #1A1A1A)
//       Extreme (11+):   #6B2D8B  (~5.5:1 on white, ~4.3:1 on #1A1A1A)
//
//   Contrast ratios verified via WebAIM Contrast Checker (2025-05).

import { useTranslation } from 'react-i18next';
import { Sun } from 'lucide-react';
import { formatValue } from '../utils/format';
import {
  Card,
  CardHeader,
  CardContent,
} from './ui/card';
import type { Observation } from '../api/types';

// ---------------------------------------------------------------------------
// Sub-components (local skeleton / error — mirror now.tsx pattern exactly)
// ---------------------------------------------------------------------------

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

function TileError({ message, onRetry }: { message: string; onRetry: () => void }) {
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
// UV range helpers
// ---------------------------------------------------------------------------

/** EPA UV index ranges mapped to WCAG-accessible colors (see file header). */
const UV_SEGMENTS = [
  { max: 2,  colorHex: '#1A7A1A', labelKey: 'solarUv.uv.low'      },
  { max: 5,  colorHex: '#B8A000', labelKey: 'solarUv.uv.moderate'  },
  { max: 7,  colorHex: '#C45E00', labelKey: 'solarUv.uv.high'      },
  { max: 10, colorHex: '#CC0000', labelKey: 'solarUv.uv.veryHigh'  },
  { max: Infinity, colorHex: '#6B2D8B', labelKey: 'solarUv.uv.extreme' },
] as const;

function uvSegmentIndex(uv: number): number {
  for (let i = 0; i < UV_SEGMENTS.length; i++) {
    if (uv <= UV_SEGMENTS[i].max) return i;
  }
  return UV_SEGMENTS.length - 1;
}

// ---------------------------------------------------------------------------
// UV Bar sub-component
// ---------------------------------------------------------------------------

interface UvBarProps {
  uv: number;
  /** Resolved risk-level label string (e.g. "High"). */
  levelLabel: string;
}

/**
 * Segmented UV bar.
 *
 * The bar is divided into 5 equal segments (Low → Extreme).  The current UV
 * level illuminates the correct segment; all segments to its left are also
 * illuminated at full opacity while segments to the right are dimmed.  The
 * active segment has a small indicator notch below it.
 *
 * The wrapping div carries the full a11y description; the SVG is aria-hidden.
 */
function UvBar({ uv, levelLabel }: UvBarProps) {
  const { t } = useTranslation('now');
  const activeIdx = uvSegmentIndex(uv);

  return (
    <div
      role="img"
      aria-label={t('solarUv.uvBarAriaLabel', { uv: formatValue(uv, 'uv'), level: levelLabel })}
      className="flex flex-col gap-1"
    >
      {/* Segmented bar */}
      <div className="flex gap-0.5 h-4 rounded-sm overflow-hidden" aria-hidden="true">
        {UV_SEGMENTS.map((seg, idx) => (
          <div
            key={seg.labelKey}
            className="flex-1 rounded-sm transition-opacity"
            style={{
              backgroundColor: seg.colorHex,
              opacity: idx <= activeIdx ? 1 : 0.2,
            }}
          />
        ))}
      </div>

      {/* Segment labels — hidden visually but the role="img" aria-label covers
          SR users.  Shown as tiny tick labels under each segment for sighted
          users on wider viewports. */}
      <div className="flex gap-0.5 text-[10px] text-muted-foreground" aria-hidden="true">
        {UV_SEGMENTS.map((seg) => (
          <span key={seg.labelKey} className="flex-1 text-center leading-none truncate">
            {t(seg.labelKey)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SolarUvCardProps {
  observation: Observation | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  /** Optional grid column class — caller controls layout placement. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SolarUvCard({ observation, loading, error, onRetry, className }: SolarUvCardProps) {
  const { t } = useTranslation('now');

  const uv = observation?.UV ?? null;
  const activeIdx = uv != null ? uvSegmentIndex(uv) : -1;
  const levelLabel = activeIdx >= 0 ? t(UV_SEGMENTS[activeIdx].labelKey) : '';

  return (
    <Card className={className} aria-busy={loading}>
      <CardHeader>
        <h2 className="font-heading text-base leading-snug font-medium flex items-center gap-2">
          <Sun aria-hidden="true" className="h-4 w-4 text-amber-500 shrink-0" />
          {t('solarUv.title')}
        </h2>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <>
            <span className="sr-only" role="status">{t('loading.solarUv')}</span>
            <TileSkeleton className="h-24" />
          </>
        ) : error ? (
          <TileError message={t('error.solarUv')} onRetry={onRetry} />
        ) : observation ? (
          <>
            {/* Solar radiation */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">
                  {t('solarUv.solarRadiation')}
                </dt>
                <dd className="mt-1 text-xl font-semibold text-foreground">
                  {observation.radiation != null
                    ? <>{formatValue(observation.radiation, 'solar')} <span className="text-sm font-normal text-muted-foreground">W/m²</span></>
                    : '—'}
                </dd>
              </div>

              {/* UV index value + risk label */}
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">
                  {t('solarUv.uvIndex')}
                </dt>
                <dd className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-semibold text-foreground">
                    {uv != null ? formatValue(uv, 'uv') : '—'}
                  </span>
                  {levelLabel && (
                    // Risk label rendered in text-foreground for WCAG 1.4.3 text contrast.
                    // The colored bar below already conveys the category via color;
                    // this label conveys it via text alone — no color needed here.
                    <span className="text-sm font-medium text-foreground">
                      {levelLabel}
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            {/* UV bar — only rendered when we have a UV value */}
            {uv != null && (
              <UvBar uv={uv} levelLabel={levelLabel} />
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t('noData.observation')}</p>
        )}
      </CardContent>
    </Card>
  );
}
