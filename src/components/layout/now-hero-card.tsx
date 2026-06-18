// now-hero-card.tsx — C1 Now-page hero card (ADR-051 / C1 composition doc).
//
// Full-width strip rendered OUTSIDE the grid (block-level, naturally full-width).
// Left side: station logo from branding.
// Right side: station name (branding.siteTitle) + location line (station.name).
//
// Design tokens (LOCKED 2026-05-31):
//   - Station name:  Manrope (--font-sans) 1.35rem (--text-hero-name) weight 700
//   - Location line: Manrope (--font-sans) 0.9rem  (--text-body)      muted
//
// A11y:
//   - <header> landmark with aria-label describing the station
//   - Logo <img> carries alt text from branding.logo.alt; if no logo, renders
//     a decorative placeholder SVG (aria-hidden)
//   - Station name is the visible heading (h1) for screen readers
//   - Color pairs (text on glass) pass WCAG AA in both light and dark themes

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NowHeroCardProps {
  /** Station display name from branding.siteTitle. Falls back to "My Weather Station". */
  stationName?: string;
  /** Location text from /api/v1/station → data.name (operator's configured location). */
  location?: string | null;
  /** Logo URL for the current theme. */
  logoUrl?: string;
  /** Alt text for the logo (from branding.logo.alt). */
  logoAlt?: string;
  /** Extra class names forwarded to the outer Card. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Placeholder logo SVG (when no branding logo is configured)
// ---------------------------------------------------------------------------

/**
 * Decorative placeholder: a simplified sun-behind-cloud icon matching the
 * C1 mockup's default logo.  aria-hidden — the station name text carries the
 * accessible label for the hero as a whole.
 */
function PlaceholderLogo({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="nhc-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFD24D" />
          <stop offset="1" stopColor="#F5A623" />
        </linearGradient>
        <linearGradient id="nhc-grey" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F3F5F8" />
          <stop offset="1" stopColor="#C7CDD6" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="17" r="6" fill="url(#nhc-gold)" />
      <ellipse cx="22" cy="26" rx="8" ry="5" fill="url(#nhc-grey)" />
      <ellipse cx="16" cy="27" rx="5" ry="4" fill="url(#nhc-grey)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * NowHeroCard — C1 Now-page hero strip.
 *
 * Rendered OUTSIDE the grid — a block-level card that is naturally full-width.
 * Uses rowSpan="half" for correct min-height (--card-half-row) on mobile.
 * No footprint prop needed (col/row classes only apply inside a grid).
 *
 * Logo: rendered as <img> when a URL is provided; falls back to PlaceholderLogo.
 * Station name: always rendered (falls back to "My Weather Station" when unset).
 * Location: rendered muted below the name when provided; hidden when null.
 */
export function NowHeroCard({
  stationName,
  location,
  logoUrl,
  logoAlt,
  className,
}: NowHeroCardProps) {
  const displayName = stationName?.trim() || 'My Weather Station';

  return (
    <Card
      rowSpan="half"
      className={cn('mx-auto w-full max-w-[var(--container-max)] min-h-[var(--card-half-row)]', className)}
    >
      <header
        aria-label={
          location
            ? `${displayName} — ${location}`
            : displayName
        }
        className="flex flex-col items-start gap-0.5 px-[var(--card-pad-compact)] md:flex-row md:items-center md:justify-between md:gap-4"
      >
        {/* ── Logo ────────────────────────────────────────────────────────── */}
        <div
          className="shrink-0"
          aria-hidden="true"
          style={{ maxHeight: 'calc(var(--card-half-row) - 2 * var(--card-pad-compact))' }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={logoAlt ?? ''}
              style={{ height: '100%', maxHeight: 'calc(var(--card-half-row) - 2 * var(--card-pad-compact))', objectFit: 'contain', objectPosition: 'left' }}
            />
          ) : (
            <PlaceholderLogo size={40} />
          )}
        </div>

        {/* ── Station name + location ─────────────────────────────────────── */}
        <div className="md:text-right">
          <h1
            className="leading-tight text-foreground text-[length:var(--text-body)] md:text-[length:var(--text-hero-name)]"
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 700,
              lineHeight: 1.15,
            }}
          >
            {displayName}
          </h1>

          {location && (
            <p
              className="text-muted-foreground"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-body)',
              }}
            >
              {location}
            </p>
          )}
        </div>
      </header>
    </Card>
  );
}
