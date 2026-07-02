// ProviderAttribution.tsx — Host-rendered data-provider attribution footer (ADR-080).
//
// Pure renderer: receives all data as props (attribution text, display name,
// logo flags) from the host page (Now page, Forecast page). Cards must NOT
// import this component — attribution is a host responsibility per
// DASHBOARD-MANUAL.md §8 "Attribution rendering". The host reads the
// `attribution` block from the capabilities API and passes it down.
//
// Logo lookup is convention-based: /providers/{providerId}.{ext} for the
// light-background variant, /providers/{providerId}-dark.{ext} for the
// dark-theme variant (see DESIGN-MANUAL.md §6 "Provider Attribution Footer").
// Only providers with a known logo file render a logo; everyone else (and
// any provider with doNotUseLogo=true) falls back to text-only attribution.

import { useTranslation } from 'react-i18next';
import { CardFooter } from '../ui/card';

const ATTRIBUTION_FOOTER_CLASS = 'border-t-0 bg-transparent';

const LOGO_HEIGHT = 32;
const LOGO_HEIGHT_COMPACT = 16;

interface LogoAsset {
  ext: 'svg' | 'png';
  hasDarkVariant: boolean;
}

/**
 * Static registry of providers that ship a logo file in public/providers/.
 * Providers not listed here (e.g. IQAir) render text-only attribution.
 * Keep in sync with DESIGN-MANUAL.md §6's logo asset table.
 */
const LOGO_ASSETS: Record<string, LogoAsset> = {
  aeris: { ext: 'svg', hasDarkVariant: true },
  owm: { ext: 'png', hasDarkVariant: true },
  nws: { ext: 'svg', hasDarkVariant: false },
  openmeteo: { ext: 'png', hasDarkVariant: false },
};

interface ProviderAttributionProps {
  attributionText: string;
  textPrefix: string;
  textProviderName: string;
  displayName: string;
  logoRequired: boolean;
  doNotUseLogo: boolean;
  textTranslatable: boolean;
  compact?: boolean;
  providerId: string;
}

const textStyle: React.CSSProperties = {
  fontSize: 'var(--text-micro)',
  color: 'var(--muted-foreground)',
  fontFamily: 'var(--font-sans)',
  fontWeight: 400,
};

export function ProviderAttribution({
  attributionText,
  textPrefix,
  textProviderName,
  displayName,
  doNotUseLogo,
  textTranslatable,
  compact,
  providerId,
}: ProviderAttributionProps) {
  const { t } = useTranslation('common');
  const logoAsset = doNotUseLogo ? undefined : LOGO_ASSETS[providerId];
  const logoH = compact ? LOGO_HEIGHT_COMPACT : LOGO_HEIGHT;
  const footerPad = compact ? '0.1875rem var(--card-pad)' : '0.625rem var(--card-pad)';
  const marginLeft = compact ? 6 : 8;

  const resolvedPrefix = textTranslatable
    ? t(`attribution.${providerId}.prefix`, textPrefix)
    : textPrefix;
  const resolvedName = textTranslatable
    ? t(`attribution.${providerId}.name`, textProviderName)
    : textProviderName;

  return (
    <CardFooter className={ATTRIBUTION_FOOTER_CLASS} style={{ padding: footerPad }}>
      {logoAsset ? (
        <>
          {resolvedPrefix && <span style={textStyle}>{resolvedPrefix}</span>}
          <img
            src={`/providers/${providerId}.${logoAsset.ext}`}
            alt={attributionText}
            className={logoAsset.hasDarkVariant ? 'dark:hidden' : undefined}
            style={{ height: logoH, width: 'auto', marginLeft: resolvedPrefix ? marginLeft : 0 }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          {logoAsset.hasDarkVariant && (
            <img
              src={`/providers/${providerId}-dark.${logoAsset.ext}`}
              alt={attributionText}
              className="hidden dark:block"
              style={{ height: logoH, width: 'auto', marginLeft: resolvedPrefix ? marginLeft : 0 }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
        </>
      ) : (
        <span style={textStyle}>
          {resolvedPrefix}{resolvedPrefix ? ' ' : ''}{resolvedName}
        </span>
      )}
    </CardFooter>
  );
}

export default ProviderAttribution;
