// ForecastDiscussionCard.tsx — Forecast Discussion card (C3 Surface D).
//
// Self-hides (returns null) when discussion is null/empty.
// Renders AFD text with whitespace-pre-wrap for line breaks.
// Footer: "Issued {time} · {senderName}"
//
// Card footprint: full (4×auto)

import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardContent, CardTitle } from '../ui/card';
import type { ForecastDiscussion } from '../../api/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatIssuedTime(isoString: string | null, tz: string, locale: string): string {
  if (!isoString) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
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
  const { t, i18n } = useTranslation('forecast');

  const { text, issuedAt } = normalise(discussion);

  // Self-hide when no text
  if (!text) return null;

  const issuedTime = issuedAt ? formatIssuedTime(issuedAt, stationTz, i18n.language) : null;

  return (
    <Card footprint="full">
      <CardHeader>
        <CardTitle as="h2">{t('discussion')}</CardTitle>
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
