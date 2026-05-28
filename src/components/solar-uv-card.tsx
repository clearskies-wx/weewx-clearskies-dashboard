// solar-uv-card.tsx — Solar radiation and UV index tile for the Now page.
//
// Displays:
//   - Solar radiation in W/m²
//   - Current (sensor) UV index with a segmented bar indicator and EPA label
//   - Forecast UV peak from the day's forecast with EPA label
//
// A11y design:
//   - Color is NOT the sole signal: each UV range has both a color segment
//     and a visible text label.  The bar carries an aria-label with both the
//     numeric value and the risk level, so screen readers receive both.
//   - UV display elements have aria-label attributes describing value + category.
//   - EPA segment colors are WCAG-adjusted for ≥3:1 contrast — see uv.ts for
//     the full color rationale and contrast audit.

import { useTranslation } from 'react-i18next';
import { Sun } from 'lucide-react';
import { formatValue } from '../utils/format';
import { asConverted } from '../api/types';
import { UV_SEGMENTS, getUvSegment } from '../utils/uv';
import {
  Card,
  CardHeader,
  CardContent,
} from './ui/card';
import type { Observation, DailyForecastPoint } from '../api/types';

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
// UV Bar sub-component
// ---------------------------------------------------------------------------

interface UvBarProps {
  uv: number;
  /** Resolved risk-level label string (e.g. "High"). */
  levelLabel: string;
}

/**
 * Segmented UV bar (current sensor reading only — not forecast).
 *
 * The bar is divided into 5 equal segments (Low → Extreme).  The current UV
 * level illuminates the correct segment; all segments to its left are also
 * illuminated at full opacity while segments to the right are dimmed.
 *
 * The wrapping div carries the full a11y description; the SVG is aria-hidden.
 * Criterion 9.4: UV bar shows current sensor value, not forecast.
 */
function UvBar({ uv, levelLabel }: UvBarProps) {
  const { t } = useTranslation('now');
  const segment = getUvSegment(uv);
  const activeIdx = segment !== null ? UV_SEGMENTS.indexOf(segment) : -1;

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
              backgroundColor: seg.color,
              opacity: idx <= activeIdx ? 1 : 0.2,
            }}
          />
        ))}
      </div>

      {/* Segment labels — shown as tiny tick labels under each segment for
          sighted users; the role="img" aria-label covers screen reader users. */}
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
// UvBadge — compact color-labeled chip for inline UV display
// ---------------------------------------------------------------------------

/**
 * UvBadge — shows a UV index value with its EPA color badge and text label.
 *
 * A11y: the color chip is aria-hidden; the text label alongside it conveys
 * the category without relying on color alone (WCAG 1.4.1).
 */
function UvBadge({ uv, label }: { uv: number; label: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block w-2.5 h-2.5 rounded-full shrink-0 self-center"
        style={{ backgroundColor: getUvSegment(uv)?.color ?? '#888' }}
      />
      <span className="text-xl font-semibold text-foreground tabular-nums">{uv}</span>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </span>
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
  /** Today's forecast — used to show forecast UV peak (criterion 9.2). */
  todayForecast?: DailyForecastPoint | null;
  /** Optional grid column class — caller controls layout placement. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SolarUvCard({ observation, loading, error, onRetry, todayForecast, className }: SolarUvCardProps) {
  const { t } = useTranslation('now');

  const uvCV = asConverted(observation?.UV ?? null);
  const uv = uvCV?.value ?? null;

  // Current sensor UV
  const currentSegment = getUvSegment(uv);
  const currentLevelLabel = currentSegment !== null ? t(currentSegment.labelKey) : '';

  // Forecast UV peak — from today's daily forecast point (criterion 9.2, 9.5)
  const forecastUv = todayForecast?.uvIndexMax ?? null;
  const forecastSegment = getUvSegment(forecastUv);
  const forecastLevelLabel = forecastSegment !== null ? t(forecastSegment.labelKey) : '';

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
                  {(() => {
                    const cv = asConverted(observation.radiation);
                    if (cv === null) return '—';
                    // Label from BFF (e.g. " W/m²") — trim leading space for inline display.
                    return <>{cv.formatted}{cv.label && <span className="text-sm font-normal text-muted-foreground"> {cv.label.trimStart()}</span>}</>;
                  })()}
                </dd>
              </div>

              {/* Current UV index value + risk label (criterion 9.1, 9.6) */}
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">
                  {t('solarUv.uv.currentUv')}
                </dt>
                <dd
                  className="mt-1"
                  aria-label={
                    uv !== null
                      ? t('solarUv.uvAriaLabel', { uv: formatValue(uv, 'uv'), level: currentLevelLabel })
                      : t('solarUv.uvAriaLabelNA')
                  }
                >
                  {uv !== null ? (
                    <UvBadge uv={uv} label={currentLevelLabel} />
                  ) : (
                    <span className="text-xl font-semibold text-foreground">—</span>
                  )}
                </dd>
              </div>

              {/* Forecast UV peak (criterion 9.2, 9.5) */}
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">
                  {t('solarUv.uv.forecastPeak')}
                </dt>
                <dd
                  className="mt-1"
                  aria-label={
                    forecastUv !== null
                      ? t('solarUv.uvAriaLabel', { uv: formatValue(forecastUv, 'uv'), level: forecastLevelLabel })
                      : t('solarUv.uvAriaLabelNA')
                  }
                >
                  {forecastUv !== null ? (
                    <UvBadge uv={forecastUv} label={forecastLevelLabel} />
                  ) : (
                    <span className="text-sm text-muted-foreground">{t('noData.forecast')}</span>
                  )}
                </dd>
              </div>
            </dl>

            {/* UV bar — current sensor value only (criterion 9.4); only rendered when we have a UV value */}
            {uv != null && (
              <UvBar uv={uv} levelLabel={currentLevelLabel} />
            )}
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t('noData.observation')}</p>
        )}
      </CardContent>
    </Card>
  );
}
