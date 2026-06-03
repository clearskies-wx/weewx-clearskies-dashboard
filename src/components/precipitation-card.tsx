// precipitation-card.tsx — Precipitation & Humidity tile for the Now page.
//
// Two-column P1 layout:
//   Left column:  Phosphor ph:drop icon + rain today + rain rate
//   Right column: Phosphor ph:drop-half-bottom icon + humidity + dewpoint
//
// Per ADR-042: dashboard has zero unit knowledge.
//   rain/rainRate use ConvertedValue.formatted verbatim.
//   humidity rendered as raw number with 1 decimal + "%".
//   dewpoint uses ConvertedValue.formatted verbatim.

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
// Inline SVG icons (Phosphor regular weight, ADR-050).
// ---------------------------------------------------------------------------

function DropIcon({ size = 36 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ color: 'currentColor', opacity: 0.7, flexShrink: 0 }}
      fill="currentColor"
    >
      <path d="M174,47.75a254.19,254.19,0,0,0-41.45-38.3,8,8,0,0,0-9.18,0A254.19,254.19,0,0,0,82,47.75C54.51,79.32,40,112.6,40,144a88,88,0,0,0,176,0C216,112.6,201.49,79.32,174,47.75ZM128,216a72.08,72.08,0,0,1-72-72c0-57.23,55.47-105,72-118,16.53,13,72,60.75,72,118A72.08,72.08,0,0,1,128,216Zm55.89-62.67a57.6,57.6,0,0,1-46.56,46.55A8.75,8.75,0,0,1,136,200a8,8,0,0,1-1.32-15.89c16.57-2.79,30.63-16.85,33.44-33.45a8,8,0,0,1,15.78,2.68Z" />
    </svg>
  );
}

function DropHalfBottomIcon({ size = 36 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ color: 'currentColor', opacity: 0.7, flexShrink: 0 }}
      fill="currentColor"
    >
      <path d="M174,47.75a254.19,254.19,0,0,0-41.45-38.3,8,8,0,0,0-9.18,0A254.19,254.19,0,0,0,82,47.75C54.51,79.32,40,112.6,40,144a88,88,0,0,0,176,0C216,112.6,201.49,79.32,174,47.75ZM187.83,184H68.17a72,72,0,0,1-8-16H195.87A72,72,0,0,1,187.83,184ZM200,144a70.57,70.57,0,0,1-.46,8H56.46a70.57,70.57,0,0,1-.46-8q0-4,.36-8H199.64Q200,140,200,144ZM128,26c14.16,11.1,56.86,47.74,68.84,94H59.16C71.14,73.76,113.84,37.12,128,26ZM82.81,200h90.38a71.82,71.82,0,0,1-90.38,0Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Shared text styles
// ---------------------------------------------------------------------------

const primaryValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display, system-ui, sans-serif)',
  fontWeight: 600,
  fontSize: '16px',
  color: 'var(--foreground)',
  letterSpacing: '-0.01em',
  fontFeatureSettings: '"tnum"',
  lineHeight: 1.2,
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  fontWeight: 400,
  fontSize: '11px',
  color: 'var(--muted-foreground)',
  lineHeight: 1.2,
};

const secondaryValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  fontWeight: 400,
  fontSize: '13px',
  color: 'var(--foreground)',
  fontFeatureSettings: '"tnum"',
  lineHeight: 1.2,
  marginTop: '0.15rem',
};

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

  const rainCV = asConverted(observation?.rain ?? null);
  const rainFormatted = rainCV?.formatted ?? '—';

  const rainRateCV = asConverted(observation?.rainRate ?? null);
  const rainRateFormatted = rainRateCV?.formatted ?? '—';

  const humidityCV = asConverted(observation?.outHumidity ?? null);
  const humidityVal = humidityCV?.value ?? null;
  const humidityFormatted = humidityVal !== null ? `${humidityVal.toFixed(1)}%` : '—';

  const dewpointCV = asConverted(observation?.dewpoint ?? null);
  const dewpointFormatted = dewpointCV?.formatted ?? '—';

  return (
    <Card footprint="tile" aria-busy={loading}>
      <CardHeader>
        <h2 className="font-heading leading-snug font-semibold pb-1.5 border-b border-border" style={{ fontSize: 'var(--text-card-title, 0.82rem)' }}>
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
          <div
            aria-live="polite"
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
            }}
          >
            {/* Left column: precipitation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0, justifyContent: 'center' }}>
              <DropIcon size={36} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <span style={primaryValueStyle}>{rainFormatted}</span>
                <span style={labelStyle}>{t('precipitationCard.rainTodayLabel')}</span>
                <span style={secondaryValueStyle}>{rainRateFormatted}</span>
                <span style={labelStyle}>{t('precipitationCard.rainRateLabel')}</span>
              </div>
            </div>

            {/* Right column: humidity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0, justifyContent: 'center' }}>
              <DropHalfBottomIcon size={36} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <span style={primaryValueStyle}>{dewpointFormatted}</span>
                <span style={labelStyle}>{t('precipitationCard.dewpointLabel')}</span>
                <span style={secondaryValueStyle}>{humidityFormatted}</span>
                <span style={labelStyle}>{t('precipitationCard.humidityLabel')}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
