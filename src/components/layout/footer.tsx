import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStation } from '../../hooks/useWeatherData';
import { useBranding } from '../../lib/branding-provider';
import { clearConsent } from '../shared/cookie-consent-banner';
import poweredLight from '../../assets/clearskies-powered-light.svg';

// ---------------------------------------------------------------------------
// Share button SVG icons — Simple Icons style, 20×20 viewBox.
// All icons are aria-hidden (decorative inside labelled <a>/<button>).
// ---------------------------------------------------------------------------

function IconReddit() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm6.066 13.71c.147.422.22.864.22 1.317 0 2.78-3.144 5.034-7.022 5.034-3.878 0-7.022-2.254-7.022-5.034 0-.453.073-.895.22-1.317a1.764 1.764 0 01-.726-1.425c0-.976.793-1.769 1.769-1.769.468 0 .893.183 1.209.48C8.13 10.009 10.01 9.371 12 9.329l1.169-5.463a.37.37 0 01.448-.283l3.717.79a1.252 1.252 0 012.362.626c0 .692-.56 1.252-1.252 1.252s-1.252-.56-1.252-1.252l-.007-.076-3.277-.696-1.03 4.827c1.934.065 3.757.7 5.163 1.694a1.76 1.76 0 011.209-.48c.976 0 1.769.793 1.769 1.769 0 .578-.278 1.09-.726 1.425zM9.2 12.746c-.692 0-1.252.56-1.252 1.252s.56 1.252 1.252 1.252 1.252-.56 1.252-1.252-.56-1.252-1.252-1.252zm5.6 0c-.692 0-1.252.56-1.252 1.252s.56 1.252 1.252 1.252 1.252-.56 1.252-1.252-.56-1.252-1.252-1.252zm-4.478 3.69a.303.303 0 01.024-.427.303.303 0 01.427.024c.453.5 1.164.786 1.952.786h.004c.788 0 1.499-.287 1.952-.786a.303.303 0 01.427-.024.303.303 0 01.024.427c-.544.6-1.399.945-2.347.954h-.112c-.948-.01-1.803-.354-2.347-.954z"/>
    </svg>
  );
}

function IconX() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>
    </svg>
  );
}

function IconFacebook() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 1.09.044 1.613.115v3.146c-.427-.044-.72-.065-.95-.065-1.348 0-1.87.513-1.87 1.846v2.516h3.692l-.724 3.667H13.752v7.98z"/>
    </svg>
  );
}

function IconPinterest() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z"/>
    </svg>
  );
}

function IconLink() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Share button row — share current page URL and title to social networks.
// Uses window.location.href + document.title so it updates per-page automatically.
// ---------------------------------------------------------------------------

// Share icon buttons sit inside the dark glass footer — use explicit white tones
// so they read correctly regardless of light/dark theme CSS variable values.
const btnClass = [
  'transition-colors',
  'focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-black/50 rounded',
].join(' ');

function ShareRow() {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const pageTitle = typeof window !== 'undefined' ? document.title : '';

  return (
    <div className="flex items-center gap-3">
      <a
        href={`https://www.reddit.com/submit?url=${encodeURIComponent(pageUrl)}&title=${encodeURIComponent(pageTitle)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('footer.shareReddit')}
        className={btnClass}
      >
        <IconReddit />
      </a>
      <a
        href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(pageTitle)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('footer.shareX')}
        className={btnClass}
      >
        <IconX />
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('footer.shareFacebook')}
        className={btnClass}
      >
        <IconFacebook />
      </a>
      <a
        href={`https://pinterest.com/pin/create/button/?url=${encodeURIComponent(pageUrl)}&description=${encodeURIComponent(pageTitle)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('footer.sharePinterest')}
        className={btnClass}
      >
        <IconPinterest />
      </a>
      <button
        type="button"
        onClick={copyLink}
        aria-label={copied ? t('footer.linkCopied') : t('footer.copyLink')}
        className={btnClass}
        style={copied ? { color: 'rgba(255,255,255,1)' } : undefined}
      >
        <IconLink />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

export function Footer() {
  const { data: station } = useStation();
  const { t } = useTranslation('common');
  const branding = useBranding();

  const copyrightName = branding.copyrightEntity || station?.name || 'Clear Skies Weather';

  return (
    <footer
      className={[
        'mt-auto px-4 py-2 pb-20 md:pb-2 text-xs',
      ].join(' ')}
      style={{
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        color: 'rgba(255, 255, 255, 0.8)',
      }}
    >

      {/* Single row on desktop, stacked on mobile: left = nav/copyright/logo · right = share icons */}
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-x-4 md:gap-y-2">
        {/* Left side: legal link · cookie settings (when GA configured) · copyright · powered-by logo */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link
            to="/legal"
            className="hidden md:inline underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-black/50 rounded"
            style={{ color: 'inherit' }}
          >
            {t('footer.legal')}
          </Link>
          {/* Cookie Settings — only shown when GA is configured. Clears stored consent
              and dispatches an event so CookieConsentBanner re-evaluates and re-appears. */}
          {branding.googleAnalyticsId && (
            <>
              <span aria-hidden="true" className="hidden md:inline">·</span>
              <button
                type="button"
                onClick={() => {
                  clearConsent();
                  window.dispatchEvent(new Event('clearskies:cookie-settings'));
                }}
                className="hidden md:inline underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-black/50 rounded"
                style={{ color: 'inherit', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
              >
                {t('footer.cookieSettings')}
              </button>
            </>
          )}
          <span aria-hidden="true" className="hidden md:inline">·</span>
          <span>© {new Date().getFullYear()} {copyrightName}</span>
          <span aria-hidden="true" className="hidden md:inline">·</span>
          {/* Always use the light logo — the footer background is always dark glass
              (rgba(0,0,0,0.65)), so the dark blue logo would be invisible in light mode. */}
          <img
            src={poweredLight}
            alt="Powered by Clear Skies"
            height={32}
            className="h-[32px] w-auto"
          />
        </div>

        {/* Right side: share buttons */}
        <ShareRow />
      </div>

    </footer>
  );
}
