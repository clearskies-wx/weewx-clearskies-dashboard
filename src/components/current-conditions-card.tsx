// current-conditions-card.tsx — First tile on the Now page.
//
// Displays: station name, large live temperature, feels-like, weather
// description text, dewpoint, relative humidity, and a smart comfort index.
//
// Comfort index (windChill / heatIndex / none) is determined by the BFF
// (ADR-042) — no client-side threshold math.  The BFF field comfortIndex
// is read directly from the Observation.
//
// The temperature and feels-like values are wrapped in aria-live="polite"
// so SSE updates announce to screen readers without interrupting the user.

import { useTranslation } from 'react-i18next';
import { asConverted } from '../api/types';
import {
  Card,
  CardHeader,
  CardContent,
} from './ui/card';
import { WeatherIcon } from './weather-icon';
import type { Observation, UnitsBlock } from '../api/types';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Pulse skeleton for loading state. Matches the TileSkeleton pattern in now.tsx. */
function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

/** Inline error with retry. Matches the TileError pattern in now.tsx. */
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

interface CurrentConditionsCardProps {
  observation: Observation | null;
  stationName: string;
  loading: boolean;
  error: Error | null;
  units?: UnitsBlock;
  /** Weather description text — from forecast when observation lacks it. */
  weatherText?: string | null;
  /** WMO weather code for the current conditions icon. */
  weatherCode?: number | string | null;
  onRetry: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CurrentConditionsCard({
  observation,
  stationName,
  loading,
  error,
  units,
  weatherText,
  weatherCode,
  onRetry,
}: CurrentConditionsCardProps) {
  const { t } = useTranslation('now');
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour >= 20;

  // Unit label comes from the BFF ConvertedValue (ADR-042).
  // Fall back to the legacy UnitsBlock for backwards compat, then to empty.
  const outTempCV = asConverted(observation?.outTemp ?? null);
  const tempUnit = outTempCV?.label ?? units?.outTemp ?? '';

  // Comfort index comes from BFF (ADR-042) — no client-side threshold math.
  const comfortIndex = observation?.comfortIndex ?? 'none';

  return (
    <Card aria-busy={loading}>
      <CardHeader>
        {/* h2 matches the heading level used by all other tiles on the Now page */}
        <h2 className="font-heading text-base leading-snug font-medium">
          {t('currentConditions')}
        </h2>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {loading ? (
          <>
            <span className="sr-only" role="status">
              {t('loading.currentConditions')}
            </span>
            <TileSkeleton className="h-5 w-40" />
            <TileSkeleton className="h-16 w-32" />
            <TileSkeleton className="h-4 w-48" />
            <TileSkeleton className="h-4 w-36" />
          </>
        ) : error ? (
          <TileError message={t('error.currentConditions')} onRetry={onRetry} />
        ) : observation ? (
          <>
            {/* Station name — plain text, not a heading (heading hierarchy
                is maintained by the card h2 above). Decorative separator
                between station name and the temperature display. */}
            {stationName && (
              <p className="text-sm text-muted-foreground">{stationName}</p>
            )}

            {/* ---- Live temperature region --------------------------------
                aria-live="polite" + aria-atomic="true" ensure the entire
                temperature announcement is re-read on SSE update, rather than
                just the changed characters.
                aria-label supplies the spoken form including the unit label
                since the unit is visually a smaller sibling element. */}
            <div
              aria-live="polite"
              aria-atomic="true"
              aria-label={
                outTempCV !== null
                  ? t('temperature.ariaLabel', {
                      temp: outTempCV.formatted,
                      unit: tempUnit,
                    })
                  : undefined
              }
              className="flex items-end gap-3 leading-none"
            >
              {weatherCode != null && (
                <WeatherIcon
                  code={weatherCode}
                  isNight={isNight}
                  size="56px"
                  className="text-foreground mb-1"
                />
              )}
              <span className="text-7xl font-bold text-foreground">
                {outTempCV?.formatted ?? '--'}
              </span>
              {/* Unit label is decorative context for the aria-label above */}
              <span
                className="text-4xl font-normal text-muted-foreground mb-1"
                aria-hidden="true"
              >
                {tempUnit}
              </span>
            </div>

            {/* ---- Feels-like (appTemp) -----------------------------------
                Also wrapped in aria-live so SSE updates are announced. */}
            {observation.appTemp != null && (() => {
              const appTempCV = asConverted(observation.appTemp);
              return appTempCV !== null ? (
                <p
                  aria-live="polite"
                  aria-atomic="true"
                  className="text-sm text-muted-foreground"
                >
                  {t('feelsLike')}{' '}
                  <span className="font-medium text-foreground">
                    {appTempCV.formatted}
                    {appTempCV.label}
                  </span>
                </p>
              ) : null;
            })()}

            {/* ---- Weather description text --------------------------------
                Sourced from observation extras (if present) or passed in from
                today's forecast.  Falls back silently when neither is present.
                textContent only — no innerHTML with untrusted data. */}
            {weatherText && (
              <p className="text-base text-foreground">{weatherText}</p>
            )}

            {/* ---- Dewpoint + Humidity row -------------------------------- */}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">
                  {t('observations.dewpoint')}
                </dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {(() => {
                    const cv = asConverted(observation.dewpoint);
                    return cv !== null ? `${cv.formatted}${cv.label}` : '—';
                  })()}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-muted-foreground uppercase tracking-wide">
                  {t('observations.humidity')}
                </dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {(() => {
                    const cv = asConverted(observation.outHumidity);
                    // Humidity label from BFF includes "%" — use it when present,
                    // otherwise fall back to appending "%" for raw numbers.
                    return cv !== null ? `${cv.formatted}${cv.label || '%'}` : '—';
                  })()}
                </dd>
              </div>

              {/* ---- Smart comfort index -----------------------------------
                  Determined by BFF (ADR-042) — no client-side threshold math.
                  comfortIndex comes from observation.comfortIndex. */}
              {comfortIndex === 'windChill' && observation.windchill != null && (() => {
                const cv = asConverted(observation.windchill);
                return cv !== null ? (
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase tracking-wide">
                      {t('observations.windChill')}
                    </dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      {cv.formatted}{cv.label}
                    </dd>
                  </div>
                ) : null;
              })()}

              {comfortIndex === 'heatIndex' && observation.heatindex != null && (() => {
                const cv = asConverted(observation.heatindex);
                return cv !== null ? (
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase tracking-wide">
                      {t('observations.heatIndex')}
                    </dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      {cv.formatted}{cv.label}
                    </dd>
                  </div>
                ) : null;
              })()}
            </dl>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t('noData.observation')}</p>
        )}
      </CardContent>
    </Card>
  );
}
