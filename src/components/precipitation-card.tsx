// precipitation-card.tsx — Precipitation tile for the Now page.
//
// Layout: centered flex-column.
//   Rain section (always shown): drop icon + rain today + rain rate.
//   Snow section (only when snow > 0): snowflake icon + snow today + snow rate.
//
// Per ADR-042: dashboard has zero unit knowledge.
//   rain/rainRate/snow/snowRate use ConvertedValue.formatted verbatim.

import { useTranslation } from 'react-i18next';
import { asConverted } from '../api/types';
import {
  Card,
  CardHeader,
  CardContent,
} from './ui/card';
import type { Observation, UnitsBlock } from '../api/types';

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

// Phosphor "snowflake" icon (regular weight) — inline SVG per ADR-050.
function SnowflakeIcon({ size = 36 }: { size?: number }) {
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
      {/* Phosphor "snowflake" regular — ph:snowflake */}
      <path d="M220,128a8,8,0,0,1-8,8H183.39l16.3,16.3a8,8,0,0,1-11.32,11.31L168,143.31V168a8,8,0,0,1-16,0V148.69l-16.29,16.3a8,8,0,0,1-11.32-11.31L140.69,136H44a8,8,0,0,1,0-16h96.69L124.39,103.7a8,8,0,0,1,11.32-11.31L152,108.69V88a8,8,0,0,1,16,0v24.69l20.38-20.38a8,8,0,0,1,11.32,11.31L183.39,120H212A8,8,0,0,1,220,128ZM88,168a8,8,0,0,0-8,8v11.32L67.31,174.63a8,8,0,0,0-11.32,11.31L68.68,198.63,57.37,209.94a8,8,0,0,0,11.32,11.32L80,210.63V222a8,8,0,0,0,16,0V210.63l11.31,11.31a8,8,0,0,0,11.32-11.32L107.32,198.63l12.69-12.69a8,8,0,0,0-11.32-11.31L96,187.32V176A8,8,0,0,0,88,168ZM198.63,57.37a8,8,0,0,0-11.32,0L176,68.68V57.37a8,8,0,0,0-16,0V80a8,8,0,0,0,8,8h22.63a8,8,0,0,0,0-16H179.32l11.31-11.31a8,8,0,0,0,0-11.32ZM57.37,80.69A8,8,0,0,0,68.68,69.38L80,58.06V80a8,8,0,0,0,16,0V34a8,8,0,0,0-8-8H42a8,8,0,0,0,0,16H57.37L46.06,53.38a8,8,0,1,0,11.31,11.31Z" />
    </svg>
  );
}


// ---------------------------------------------------------------------------
// Shared text styles
// ---------------------------------------------------------------------------

const primaryValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display, system-ui, sans-serif)',
  fontWeight: 600,
  fontSize: 'var(--text-stat-tile)',
  color: 'var(--foreground)',
  letterSpacing: '-0.01em',
  fontFeatureSettings: '"tnum"',
  lineHeight: 1.2,
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  fontWeight: 400,
  fontSize: 'var(--text-label)',
  color: 'var(--muted-foreground)',
  lineHeight: 1.2,
};

const secondaryValueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans, system-ui, sans-serif)',
  fontWeight: 400,
  fontSize: 'var(--text-secondary)',
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
  units?: UnitsBlock | null;
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

  const snowCV = asConverted(observation?.snow ?? null);
  const snowFormatted = snowCV?.formatted ?? '—';
  const snowVal = snowCV?.value ?? null;

  const snowRateCV = asConverted(observation?.snowRate ?? null);
  const snowRateFormatted = snowRateCV?.formatted ?? '—';

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
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {/* Rain section — always shown */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <DropIcon size={36} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                <span style={primaryValueStyle}>{rainFormatted}</span>
                <span style={labelStyle}>{t('precipitationCard.rainTodayLabel')}</span>
                <span style={secondaryValueStyle}>{rainRateFormatted}</span>
                <span style={labelStyle}>{t('precipitationCard.rainRateLabel')}</span>
              </div>
            </div>

            {/* Snow section — only shown when snow > 0 */}
            {snowVal !== null && snowVal > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <SnowflakeIcon size={36} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <span style={primaryValueStyle}>{snowFormatted}</span>
                  <span style={labelStyle}>{t('precipitationCard.snowTodayLabel', 'Snow Today')}</span>
                  {snowRateCV !== null && (
                    <>
                      <span style={secondaryValueStyle}>{snowRateFormatted}</span>
                      <span style={labelStyle}>{t('precipitationCard.snowRateLabel', 'Snow Rate')}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
