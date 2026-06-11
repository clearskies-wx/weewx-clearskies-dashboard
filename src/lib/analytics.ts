// analytics.ts — GA4 dynamic loader + consent-gated page view tracking.
//
// Design constraints (ADR-055, GDPR):
//   - NO GA script, cookie, or network request fires before explicit user consent.
//   - initGoogleAnalytics() is only called from CookieConsentBanner on "Accept".
//   - removeGoogleAnalytics() is called on "Reject" and on "Cookie Settings" revoke.
//
// GA4 script injection pattern:
//   <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX">
//   window.dataLayer = window.dataLayer || [];
//   function gtag(){ dataLayer.push(arguments); }
//   gtag('js', new Date());
//   gtag('config', 'G-XXXXXXXXXX');
//
// The script tag is injected at runtime, NOT present in index.html, so GA cannot
// fire before consent is recorded regardless of page caching.

declare global {
  // eslint-disable-next-line no-var
  var dataLayer: unknown[];
  function gtag(...args: unknown[]): void;
}

const SCRIPT_ID = 'clearskies-gtag-script';
const CONFIG_ID = 'clearskies-gtag-config';
const GA_COOKIE_NAMES = ['_ga', '_gid', '_gat'];
const GA_COOKIE_PREFIXES = ['_ga_', '_gat_'];

/**
 * initGoogleAnalytics — injects gtag.js + config snippet after consent.
 * Safe to call multiple times; returns immediately if already loaded.
 */
export function initGoogleAnalytics(measurementId: string): void {
  if (!measurementId || typeof document === 'undefined') return;

  // Idempotent: skip if script already present.
  if (document.getElementById(SCRIPT_ID)) return;

  // gtag() shim — must exist before the external script loads.
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { anonymize_ip: true });

  // Config inline script (non-blocking shim is above; just anchor to DOM for cleanup).
  const configScript = document.createElement('script');
  configScript.id = CONFIG_ID;
  configScript.type = 'text/javascript';
  configScript.textContent = `/* gtag config for ${measurementId} — managed by clearskies */`;
  document.head.appendChild(configScript);

  // Main async gtag.js loader.
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

/**
 * removeGoogleAnalytics — removes injected script tags and expires GA cookies.
 * Called when the user rejects consent or revokes it via Cookie Settings.
 * A full page reload is required for GA to be completely inactive; this prevents
 * further data collection from the point of revocation onward.
 */
export function removeGoogleAnalytics(): void {
  if (typeof document === 'undefined') return;

  // Remove injected script elements.
  document.getElementById(SCRIPT_ID)?.remove();
  document.getElementById(CONFIG_ID)?.remove();

  // Overwrite gtag() so any in-flight calls become no-ops.
  window.gtag = function () { /* revoked */ };

  // Expire GA cookies on the current domain and all parent domains.
  const domain = window.location.hostname;
  const domainParts = domain.split('.');
  const domainsToTry: string[] = [domain];
  // Also try .example.com forms for sub-domains.
  for (let i = 1; i < domainParts.length - 1; i++) {
    domainsToTry.push('.' + domainParts.slice(i).join('.'));
  }

  const expiry = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';

  // Get all cookie names first so we can also clear prefixed ones (e.g. _ga_XXXXX).
  const allCookieNames = document.cookie.split(';').map((c) => c.trim().split('=')[0]);

  const namesToClear = [
    ...GA_COOKIE_NAMES,
    ...allCookieNames.filter((name) =>
      GA_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix))
    ),
  ];

  for (const name of namesToClear) {
    for (const d of domainsToTry) {
      document.cookie = `${name}=; ${expiry}; path=/; domain=${d}`;
    }
    // Also clear without explicit domain (covers localhost).
    document.cookie = `${name}=; ${expiry}; path=/`;
  }
}

/**
 * trackPageView — fires a GA4 page_view event for the given path + title.
 * No-op if gtag is not loaded (i.e. consent not given or GA not initialised).
 */
export function trackPageView(path: string, title: string): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title,
  });
}
