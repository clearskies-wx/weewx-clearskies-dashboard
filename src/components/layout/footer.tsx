import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStation } from '../../hooks/useWeatherData';
import { useBranding } from '../../lib/branding-provider';
import poweredBlue from '../../assets/clearskies-powered-blue.svg';
import poweredLight from '../../assets/clearskies-powered-light.svg';

// ---------------------------------------------------------------------------
// Social icon SVG paths — Simple Icons style, 24×24 viewBox.
// Each icon is aria-hidden (decorative inside a labelled <a>).
// ---------------------------------------------------------------------------

function IconFacebook() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width={20}
      height={20}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function IconTwitterX() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width={20}
      height={20}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width={20}
      height={20}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z" />
    </svg>
  );
}

function IconYouTube() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width={20}
      height={20}
      aria-hidden="true"
      focusable="false"
    >
      {/* Outer shape */}
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
      {/* Play triangle */}
      <path d="M9.545 15.568V8.432L15.818 12z" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Social link row — only rendered when at least one URL is configured.
// Each anchor uses aria-label to name the destination (icon is decorative).
// Focus ring uses ring-2 ring-ring ring-offset-2 per the project convention,
// visible on both light and dark backgrounds.
// ---------------------------------------------------------------------------

interface SocialLinks {
  facebook?: string;
  twitter?: string;
  instagram?: string;
  youtube?: string;
}

function SocialRow({ social }: { social: SocialLinks }) {
  const links: { key: keyof SocialLinks; label: string; Icon: () => React.ReactElement }[] = [
    { key: 'facebook', label: 'Facebook', Icon: IconFacebook },
    { key: 'twitter', label: 'Twitter / X', Icon: IconTwitterX },
    { key: 'instagram', label: 'Instagram', Icon: IconInstagram },
    { key: 'youtube', label: 'YouTube', Icon: IconYouTube },
  ];

  const active = links.filter(({ key }) => Boolean(social[key]));
  if (active.length === 0) return null;

  return (
    <div className="flex items-center gap-4">
      {active.map(({ key, label, Icon }) => (
        <a
          key={key}
          href={social[key]}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className={[
            'text-muted-foreground hover:text-foreground transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded',
          ].join(' ')}
        >
          <Icon />
        </a>
      ))}
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

  const hasSocial =
    branding.social != null &&
    Object.values(branding.social).some(Boolean);

  return (
    <footer className={[
      'mt-auto border-t border-border px-4 py-3 text-sm text-muted-foreground',
      // On mobile the bottom nav bar is fixed at 56px. Without bottom padding the footer
      // renders beneath it and is invisible. md:pb-0 restores normal flow on desktop.
      'pb-[calc(56px+12px)] md:pb-3',
    ].join(' ')}>

      {/* Primary row: nav links + copyright + powered-by logo */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link
          to="/legal"
          className="hover:text-foreground underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
        >
          {t('footer.legal')}
        </Link>
        <span aria-hidden="true">·</span>
        <span>© {new Date().getFullYear()} {station?.name ?? 'Clear Skies Weather'}</span>
        <span aria-hidden="true">·</span>
        {/* Blue logo for light mode; light-blue logo for dark mode.
            Only the visible image is in the a11y tree (display:none removes it).
            dark: variant maps to [data-theme="dark"] per index.css @custom-variant. */}
        <img
          src={poweredBlue}
          alt="Powered by Clear Skies"
          height={22}
          className="h-[22px] w-auto dark:hidden"
        />
        <img
          src={poweredLight}
          alt="Powered by Clear Skies"
          height={22}
          className="h-[22px] w-auto hidden dark:inline"
        />
      </div>

      {/* Social icons row — only rendered when at least one URL is configured */}
      {hasSocial && branding.social != null && (
        <div className="mt-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          <SocialRow social={branding.social} />
        </div>
      )}

      {/* GEM attribution — always shown (earthquake data is always loaded per ADR-040) */}
      <p className="mt-1 text-xs text-muted-foreground/70">
        Fault data © GEM Foundation (CC BY-SA 4.0)
      </p>
    </footer>
  );
}
