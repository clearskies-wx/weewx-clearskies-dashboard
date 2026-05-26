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
//   - Trend arrow is a Unicode character in a span with role="img" and
//     aria-label describing the trend (e.g. "Pressure trend: Rising") so
//     screen readers receive text, not an arrow glyph.
//   - Color is NOT used as the sole state signal — the trend is also conveyed
//     by the arrow character and the text label.

import { useTranslation } from 'react-i18next';
import { CloudRain, Gauge } from 'lucide-react';
import { asConverted } from '../api/types';
import { barometerTrendArrow, barometerTrendLabel } from '../utils/barometer';
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PrecipitationBarometerCardProps {
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

export function PrecipitationBarometerCard({
  observation,
  loading,
  error,
  onRetry,
  className,
}: PrecipitationBarometerCardProps) {
  const { t } = useTranslation('now');

  // barometerTrend helpers need a raw number; extract .value from ConvertedValue.
  const trendCV = asConverted(observation?.barometerTrend ?? null);
  const trendNumeric = trendCV?.value ?? null;
  const trendArrow = barometerTrendArrow(trendNumeric);
  const trendText = barometerTrendLabel(trendNumeric, t);

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
                {/* Trend arrow — role="img" so the glyph is named, not spelled
                    out.  The text label also appears visually for all users. */}
                <span
                  role="img"
                  aria-label={t('precipBarometer.trendAriaLabel', { trend: trendText })}
                  className="text-lg leading-none text-muted-foreground select-none"
                >
                  {trendArrow}
                </span>
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
