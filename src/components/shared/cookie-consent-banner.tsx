// cookie-consent-banner.tsx — GDPR-compliant opt-in consent banner for Google Analytics.
//
// Behavior rules:
//   - Only renders when branding.googleAnalyticsId is a non-empty string.
//   - Only renders when no consent decision is recorded in localStorage.
//   - Respects navigator.globalPrivacyControl: auto-rejects without showing the banner.
//   - Accept: stores consent + calls initGoogleAnalytics(); banner disappears.
//   - Reject: stores rejection + calls removeGoogleAnalytics(); banner disappears.
//   - Escape key = reject (dismiss without accepting).
//
// Accessibility:
//   - role="dialog" + aria-modal="true" + aria-labelledby on the container.
//   - Focus trap: Tab/Shift+Tab cycles within the banner while open.
//   - Focus moves into the banner on mount; returns to the previously focused element
//     when dismissed.
//   - Equal-prominence Accept + Reject buttons (NOT an accept-dark-pattern).
//
// Storage key: clearskies.cookie-consent
// Value shape: { consent: "accepted" | "rejected", timestamp: "<ISO-8601>" }

import { useEffect, useRef, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBranding } from '../../lib/branding-provider';
import { initGoogleAnalytics, removeGoogleAnalytics } from '../../lib/analytics';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'clearskies.cookie-consent';

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

export type ConsentValue = 'accepted' | 'rejected';

interface ConsentRecord {
  consent: ConsentValue;
  timestamp: string;
}

function readConsent(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'consent' in parsed &&
      'timestamp' in parsed &&
      (
        (parsed as ConsentRecord).consent === 'accepted' ||
        (parsed as ConsentRecord).consent === 'rejected'
      )
    ) {
      return parsed as ConsentRecord;
    }
    return null;
  } catch {
    return null;
  }
}

function writeConsent(consent: ConsentValue): void {
  const record: ConsentRecord = { consent, timestamp: new Date().toISOString() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // localStorage unavailable — fail silently; banner will re-appear on next load.
  }
}

/** clearConsent — removes the stored decision so the banner re-appears. */
export function clearConsent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

// ---------------------------------------------------------------------------
// Focus trap helper
// ---------------------------------------------------------------------------

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CookieConsentBanner() {
  const branding = useBranding();
  const measurementId = branding.googleAnalyticsId ?? '';

  // Controlled visibility: null = "not yet determined" (suppresses flash-of-content).
  const [visible, setVisible] = useState<boolean | null>(null);

  const bannerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ---------------------------------------------------------------------------
  // Initialisation — check GPC, localStorage, and GA config on mount.
  // Also listens for the "clearskies:cookie-settings" event fired by the footer's
  // "Cookie Settings" button, which clears consent and re-shows the banner.
  // ---------------------------------------------------------------------------

  const evaluateConsent = useCallback(() => {
    // No GA ID configured → never show banner.
    if (!measurementId) {
      setVisible(false);
      return;
    }

    // GPC auto-reject: store rejection and never show banner.
    // navigator.globalPrivacyControl is a non-standard extension; cast safely.
    const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
    if (gpc === true) {
      writeConsent('rejected');
      removeGoogleAnalytics();
      setVisible(false);
      return;
    }

    // Check stored decision.
    const stored = readConsent();
    if (stored) {
      if (stored.consent === 'accepted') {
        initGoogleAnalytics(measurementId);
      }
      setVisible(false);
      return;
    }

    // No prior decision → show the banner.
    setVisible(true);
  }, [measurementId]);

  useEffect(() => {
    evaluateConsent();
  }, [evaluateConsent]);

  // Listen for "clearskies:cookie-settings" event dispatched by the footer
  // "Cookie Settings" button. Re-evaluates consent state (which at that point
  // will have been cleared, so the banner re-appears).
  useEffect(() => {
    const handleCookieSettings = () => {
      removeGoogleAnalytics();
      evaluateConsent();
    };
    window.addEventListener('clearskies:cookie-settings', handleCookieSettings);
    return () => {
      window.removeEventListener('clearskies:cookie-settings', handleCookieSettings);
    };
  }, [evaluateConsent]);

  // ---------------------------------------------------------------------------
  // Focus management: when banner becomes visible, capture focus inside it.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!visible || !bannerRef.current) return;

    // Remember where focus was before the banner appeared.
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Move focus to the first focusable element inside the banner.
    const focusables = getFocusableElements(bannerRef.current);
    if (focusables.length > 0) {
      focusables[0].focus();
    } else {
      bannerRef.current.focus();
    }
  }, [visible]);

  // ---------------------------------------------------------------------------
  // Accept / Reject handlers
  // ---------------------------------------------------------------------------

  const handleAccept = useCallback(() => {
    writeConsent('accepted');
    initGoogleAnalytics(measurementId);
    setVisible(false);
    previousFocusRef.current?.focus();
  }, [measurementId]);

  const handleReject = useCallback(() => {
    writeConsent('rejected');
    removeGoogleAnalytics();
    setVisible(false);
    previousFocusRef.current?.focus();
  }, []);

  // ---------------------------------------------------------------------------
  // Keyboard handling: Escape = reject; Tab = focus trap.
  // ---------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleReject();
        return;
      }

      if (e.key === 'Tab' && bannerRef.current) {
        const focusables = getFocusableElements(bannerRef.current);
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [handleReject],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // null = not yet determined; false = hidden. Both suppress render.
  if (!visible) return null;

  return (
    /*
     * Fixed bottom banner — sits above all page content (z-50).
     * The backdrop is intentionally NOT included so the page remains usable
     * while the banner is showing (non-blocking consent UX).
     *
     * role="dialog" + aria-modal="true" signals a dialog to screen readers.
     * aria-labelledby points to the visible banner text.
     * tabIndex={-1} allows the container itself to receive programmatic focus
     * if no focusable children are found.
     */
    <div
      ref={bannerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-consent-text"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={[
        'fixed bottom-0 left-0 right-0 z-50',
        'px-4 py-4',
        // Glass surface consistent with Footer style.
        'border-t border-white/10',
        // Outline-none for programmatic focus; focus-visible handles keyboard focus.
        'outline-none',
      ].join(' ')}
      style={{
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Banner text */}
        <p
          id="cookie-consent-text"
          className="text-sm leading-relaxed"
          style={{ color: 'rgba(255, 255, 255, 0.9)' }}
        >
          This website uses cookies to analyze traffic via Google Analytics. No personal
          data is collected.{' '}
          <Link
            to="/legal"
            className={[
              'underline underline-offset-4',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-black/80 rounded',
            ].join(' ')}
            style={{ color: 'rgba(255, 255, 255, 0.9)' }}
          >
            Learn more
          </Link>
          .
        </p>

        {/* Action buttons — equal visual weight (ADR: no accept-dark-pattern) */}
        <div className="flex shrink-0 gap-3">
          {/*
           * Both buttons use the same visual treatment: outline style on dark glass.
           * Neither is "default" (filled) so there is no visual hierarchy that nudges
           * the user toward one choice over the other.
           */}
          <button
            type="button"
            onClick={handleReject}
            className={[
              'flex-1 sm:flex-none',
              'rounded-lg border px-4 py-2 text-sm font-medium',
              'transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-black/80',
            ].join(' ')}
            style={{
              borderColor: 'rgba(255, 255, 255, 0.4)',
              color: 'rgba(255, 255, 255, 0.9)',
              background: 'rgba(255, 255, 255, 0.08)',
            }}
          >
            Reject
          </button>

          <button
            type="button"
            onClick={handleAccept}
            className={[
              'flex-1 sm:flex-none',
              'rounded-lg border px-4 py-2 text-sm font-medium',
              'transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-black/80',
            ].join(' ')}
            style={{
              borderColor: 'rgba(255, 255, 255, 0.4)',
              color: 'rgba(255, 255, 255, 0.9)',
              background: 'rgba(255, 255, 255, 0.08)',
            }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
