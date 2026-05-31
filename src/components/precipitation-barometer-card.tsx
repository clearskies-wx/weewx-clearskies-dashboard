// precipitation-barometer-card.tsx — Precipitation and barometer tile for the Now page.
//
// Displays:
//   - Rain today (cumulative, in inches)
//   - Rain rate (current, in/hr)  — previously missing from display; new data point
//   - Barometer value (inHg)
//   - Barometer trend arrow (↑ / ↓ / →) + text label (Rising / Falling / Steady)
//
// Barometer helpers live in src/utils/barometer.ts (react-refresh requires that
// non-component exports live in separate files).
//
// A11y:
//   - Trend arrow icon carries aria-hidden="true"; the visible text label and
//     the accessible name on the parent <dd> convey state to screen readers.
//   - Color is NOT used as the sole state signal — the trend is also conveyed
//     by the arrow icon and the text label (rules/coding.md §5.1).

import { useTranslation } from 'react-i18next';
import { CloudRain, Gauge, ArrowUp, ArrowDown, ArrowRight } from '@phosphor-icons/react';
import { asConverted } from '../api/types';
import { barometerTrendLabel } from '../utils/barometer';
import type { BarometerTrendDirection } from '../utils/barometer';
import {
  Card,
  CardHeader,
  CardContent,
} from './ui/card';
import type { Observation } from '../api/types';

// ---------------------------------------------------------------------------
// Sub-components
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

// Trend arrow — Phosphor reusable set (ADR-050: single set for all metric trends).
// ph:arrow-up (rising) · ph:arrow-down (falling) · ph:arrow-right (steady).
// Icon is aria-hidden; accessible name comes from the visible text label.
function TrendArrow({ direction }: { direction: BarometerTrendDirection }) {
  if (direction === 'rising') {
    return <ArrowUp aria-hidden="true" className="h-4 w-4 text-muted-foreground" />;
  }
  if (direction === 'falling') {
    return <ArrowDown aria-hidden="true" className="h-4 w-4 text-muted-foreground" />;
  }
  return <ArrowRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PrecipitationBarometerCardProps {
  observation: Observation | null;
  /**
   * BFF-computed barometer trend direction from the /current envelope.
   * Passed separately from observation because it lives at the response
   * envelope level, not inside the Observation data object (ADR-041/ADR-042).
   */
  barometerTrendDirection: BarometerTrendDirection;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  /** Optional grid column class — caller controls layout placement. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PrecipitationBarometerCard({
  observation,
  barometerTrendDirection,
  loading,
  error,
  onRetry,
  className,
}: PrecipitationBarometerCardProps) {
  const { t } = useTranslation('now');

  // Use the BFF-supplied direction string directly (ADR-042: no client unit math).
  const trendText = barometerTrendLabel(barometerTrendDirection, t);

  return (
    <Card className={className} aria-busy={loading}>
      <CardHeader>
        <h2 className="font-heading text-base leading-snug font-medium flex items-center gap-2">
          <CloudRain aria-hidden="true" className="h-4 w-4 text-blue-400 shrink-0" />
          {t('precipBarometer.title')}
        </h2>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <>
            <span className="sr-only" role="status">{t('loading.precipBarometer')}</span>
            <TileSkeleton className="h-24" />
          </>
        ) : error ? (
          <TileError message={t('error.precipBarometer')} onRetry={onRetry} />
        ) : observation ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {/* Rain today */}
            <div>
              <dt className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <CloudRain aria-hidden="true" className="h-3 w-3" />
                {t('precipBarometer.rainToday')}
              </dt>
              <dd className="mt-1 text-xl font-semibold text-foreground">
                {(() => {
                  const cv = asConverted(observation.rain);
                  if (cv === null) return '—';
                  return <>{cv.formatted}{cv.label && <span className="text-sm font-normal text-muted-foreground"> {cv.label.trimStart()}</span>}</>;
                })()}
              </dd>
            </div>

            {/* Rain rate */}
            <div>
              <dt className="text-xs text-muted-foreground uppercase tracking-wide">
                {t('precipBarometer.rainRate')}
              </dt>
              <dd className="mt-1 text-xl font-semibold text-foreground">
                {(() => {
                  const cv = asConverted(observation.rainRate);
                  if (cv === null) return '—';
                  return <>{cv.formatted}{cv.label && <span className="text-sm font-normal text-muted-foreground"> {cv.label.trimStart()}</span>}</>;
                })()}
              </dd>
            </div>

            {/* Barometer + trend */}
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Gauge aria-hidden="true" className="h-3 w-3" />
                {t('precipBarometer.barometer')}
              </dt>
              <dd className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-semibold text-foreground">
                  {(() => {
                    const cv = asConverted(observation.barometer);
                    if (cv === null) return '—';
                    return <>{cv.formatted}{cv.label && <span className="text-sm font-normal text-muted-foreground"> {cv.label.trimStart()}</span>}</>;
                  })()}
                </span>
                {/* Trend arrow — Phosphor reusable set (ADR-050).
                    Icon is aria-hidden; the text label provides the accessible name. */}
                <TrendArrow direction={barometerTrendDirection} />
                <span className="text-sm text-muted-foreground">{trendText}</span>
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-muted-foreground text-sm">{t('noData.observation')}</p>
        )}
      </CardContent>
    </Card>
  );
}
