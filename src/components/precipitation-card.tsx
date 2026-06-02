// precipitation-card.tsx — Precipitation tile component for the Now page.
//
// Renders the P1 icon-left / text-right tile layout showing:
//   - Rain today (observation.rain.formatted — cumulative daily accumulation)
//   - Rain rate (observation.rainRate.formatted — current rate)
//
// Design pattern:
//   - Card footprint "tile" (1 column, ADR-051).
//   - Title: "Precipitation" — text-only, no icon.  Manrope 600 via font-heading.
//   - Content: flex row, centered on card, gap 12px.
//       Left:  Phosphor ph:drop icon — inline SVG, 52px, opacity-70, aria-hidden.
//       Right: text block — primary value + label + secondary value + label.
//
// A11y (WCAG 2.1 AA):
//   - Decorative SVG icon carries aria-hidden="true" and focusable="false".
//   - aria-live="polite" on values container for SSE live updates (ADR-041).
//   - aria-busy on Card during loading state.
//   - Heading is <h2> (CardHeader establishes section; barometer-card precedent).
//
// Per ADR-042: dashboard has zero unit knowledge.
//   - rain.formatted and rainRate.formatted are rendered verbatim (ConvertedValue.formatted).
//   - asConverted() normalises the ConvertedValue | number | null union from the BFF.

import { useTranslation } from 'react-i18next';
import { asConverted } from '../api/types';
import {
  Card,
  CardHeader,
  CardContent,
} from './ui/card';
import type { Observation } from '../api/types';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PrecipitationSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted h-20"
      aria-hidden="true"
    />
  );
}

function PrecipitationError({
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
// Phosphor ph:drop icon — inline SVG (ADR-050: Phosphor regular set).
//
// Path source: Phosphor Icons "drop" (regular weight).
// viewBox 0 0 256 256 — standard Phosphor canvas.
// aria-hidden="true" + focusable="false": decorative icon, not informational.
// ---------------------------------------------------------------------------

function DropIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={52}
      height={52}
      aria-hidden="true"
      focusable="false"
      style={{
        color: 'currentColor',
        opacity: 0.7,
        flexShrink: 0,
      }}
      fill="currentColor"
    >
      <path d="M174,47.75a254.19,254.19,0,0,0-41.45-38.3,8,8,0,0,0-9.18,0A254.19,254.19,0,0,0,82,47.75C54.51,79.32,40,112.6,40,144a88,88,0,0,0,176,0C216,112.6,201.49,79.32,174,47.75ZM128,216a72.08,72.08,0,0,1-72-72c0-57.23,55.47-105,72-118,16.53,13,72,60.75,72,118A72.08,72.08,0,0,1,128,216Zm55.89-62.67a57.6,57.6,0,0,1-46.56,46.55A8.75,8.75,0,0,1,136,200a8,8,0,0,1-1.32-15.89c16.57-2.79,30.63-16.85,33.44-33.45a8,8,0,0,1,15.78,2.68Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PrecipitationCardProps {
  observation: Observation | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PrecipitationCard({
  observation,
  loading = false,
  error = null,
  onRetry,
}: PrecipitationCardProps) {
  const { t } = useTranslation('now');

  // Normalise rain fields via asConverted (ADR-042).
  const rainCV = asConverted(observation?.rain ?? null);
  const rainFormatted = rainCV?.formatted ?? '—';

  const rainRateCV = asConverted(observation?.rainRate ?? null);
  const rainRateFormatted = rainRateCV?.formatted ?? '—';

  return (
    <Card footprint="tile" aria-busy={loading}>
      <CardHeader>
        {/* Title: text-only per spec — NO icon.  Manrope 600 via font-heading. */}
        <h2 className="font-heading text-base leading-snug font-semibold">
          {t('precipitationCard.title')}
        </h2>
      </CardHeader>

      <CardContent>
        {loading ? (
          <>
            <span className="sr-only" role="status">{t('loading.precipitation')}</span>
            <PrecipitationSkeleton />
          </>
        ) : error ? (
          <PrecipitationError
            message={t('error.precipitation')}
            onRetry={onRetry ?? (() => undefined)}
          />
        ) : (
          /* P1 pattern: icon-left, text-right, centered on card. */
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
            }}
          >
            {/* Left: drop icon — decorative, aria-hidden */}
            <DropIcon />

            {/* Right: text block — primary + secondary values */}
            {/* aria-live="polite" so SSE updates are announced (ADR-041). */}
            <div
              aria-live="polite"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              }}
            >
              {/* Primary: rain today */}
              <span
                style={{
                  fontFamily: 'var(--font-display, system-ui, sans-serif)',
                  fontWeight: 600,
                  fontSize: '18px',
                  color: 'var(--foreground)',
                  letterSpacing: '-0.01em',
                  fontFeatureSettings: '"tnum"',
                  lineHeight: 1.2,
                }}
              >
                {rainFormatted}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                  fontWeight: 400,
                  fontSize: '12px',
                  color: 'var(--muted-foreground)',
                  lineHeight: 1.2,
                }}
              >
                {t('precipitationCard.rainTodayLabel')}
              </span>

              {/* Secondary: rain rate */}
              <span
                style={{
                  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                  fontWeight: 400,
                  fontSize: '13px',
                  color: 'var(--foreground)',
                  fontFeatureSettings: '"tnum"',
                  lineHeight: 1.2,
                  marginTop: '0.2rem',
                }}
              >
                {rainRateFormatted}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                  fontWeight: 400,
                  fontSize: '11px',
                  color: 'var(--muted-foreground)',
                  lineHeight: 1.2,
                }}
              >
                {t('precipitationCard.rainRateLabel')}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
