// ForecastDiscussionCard.tsx — Forecast Discussion card (C3 Surface D).
//
// Self-hides (returns null) when discussion is null/empty.
// Renders AFD text with whitespace-pre-wrap for line breaks.
// Footer: "Issued {time} · {senderName}"
//
// Card footprint: full (4×auto)

import { useTranslation } from 'react-i18next';
import { Newspaper } from '@phosphor-icons/react';
import { Card, CardHeader, CardContent } from '../ui/card';
import type { ForecastDiscussion } from '../../api/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatIssuedTime(isoString: string | null, tz: string): string {
  if (!isoString) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
      timeZoneName: 'short',
    }).format(new Date(isoString));
  } catch {
    return '';
  }
}

/**
 * Normalise the discussion field which may be a string, ForecastDiscussion
 * object, or null/undefined (per ForecastBundle.discussion type).
 */
function normalise(
  raw: string | ForecastDiscussion | null | undefined,
): { text: string | null; issuedAt: string | null; senderName: string | null } {
  if (!raw) return { text: null, issuedAt: null, senderName: null };
  if (typeof raw === 'string') return { text: raw || null, issuedAt: null, senderName: null };
  return {
    text: raw.text || null,
    issuedAt: raw.issuedAt ?? null,
    senderName: null, // ForecastDiscussion type has no senderName field
  };
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface ForecastDiscussionCardProps {
  discussion: string | ForecastDiscussion | null | undefined;
  stationTz?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ForecastDiscussionCard({
  discussion,
  stationTz = 'UTC',
}: ForecastDiscussionCardProps) {
  const { t } = useTranslation('forecast');

  const { text, issuedAt } = normalise(discussion);

  // Self-hide when no text
  if (!text) return null;

  const issuedTime = issuedAt ? formatIssuedTime(issuedAt, stationTz) : null;

  return (
    <Card footprint="full">
      <CardHeader>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            borderBottom: '1px solid var(--border, rgba(0,0,0,0.12))',
            paddingBottom: '0.375rem',
            marginBottom: '0.75rem',
          }}
        >
          <span
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
              fontSize: 'var(--text-card-title, 0.82rem)',
              fontWeight: 600,
              color: 'var(--foreground)',
            }}
          >
            <Newspaper
              aria-hidden="true"
              focusable={false}
              size={16}
              style={{ opacity: 0.75, flexShrink: 0 }}
            />
            {t('discussion')}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        {/* AFD body text — whitespace-pre-wrap to preserve line breaks */}
        <p
          style={{
            fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
            fontSize: 'var(--text-body, 0.9rem)',
            color: 'var(--foreground)',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            margin: '0 0 0.6rem',
          }}
        >
          {text}
        </p>

        {/* Footer: issued time */}
        {issuedTime && (
          <p
            style={{
              fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
              fontSize: 'var(--text-label, 0.75rem)',
              color: 'var(--muted-foreground)',
            }}
          >
            Issued {issuedTime}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default ForecastDiscussionCard;
