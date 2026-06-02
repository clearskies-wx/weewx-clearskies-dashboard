/**
 * alert-icon-map.tsx — AlertIcon component for per-type alert icons (ADR-050).
 *
 * Resolves an alert event string to the correct icon via getAlertCategory()
 * and renders it. This file exports ONLY a component so the
 * react-refresh/only-export-components rule is satisfied.
 *
 * Classification logic lives in alert-category.ts (pure function, no JSX).
 * See that file for the 18-category table, ADR-050/ADR-052 documentation, and key derivation.
 *
 * A11y (rules/coding.md §5.5, ADR-050):
 *   - Color is NOT the only signal: the alert pill always shows both the icon
 *     AND the visible event text (§5.1).
 *   - Icons are informational → the accessible name comes from the surrounding
 *     aria-live region and visible text, not from the icon itself.
 *   - All icon components carry aria-hidden="true" on their SVG element so
 *     screen readers do not read decorative glyph names.
 */

import type { ReactElement } from 'react';
import {
  Warning,
  Fire,
  Hurricane,
  Lightning,
  Tornado,
  Wind,
  Sailboat,
  Snowflake,
  Thermometer,
  CloudFog,
} from '@phosphor-icons/react';
import { Flood } from './flood';
import { Tsunami } from './tsunami';
import { Earthquake } from './earthquake';
import { Volcano } from './volcano';
import { WeatherHail } from './weather-hail';
import { Landslide } from './landslide';
import { Air } from './air';
import { getAlertCategory } from './alert-category';

type AlertIconProps = { 'aria-hidden'?: boolean | 'true'; className?: string };

/**
 * AlertIcon — resolves and renders the alert icon for a given event string or
 * ADR-052 structured input { event?, hazardType? }.
 *
 * Props:
 *   event    — plain event-name string (backward-compatible NWS path).
 *   category — pre-resolved AlertCategory (ADR-052 path — pass result of
 *              getAlertCategory). When supplied, skips internal resolution.
 *
 * Uses an explicit render switch rather than `const Icon = getAlertCategory()`
 * + `<Icon />` to avoid the react-hooks/purity "component created during render"
 * lint rule.
 */
export function AlertIcon({
  event,
  category: categoryProp,
  className,
}: {
  /** Plain event-name string (backward-compatible NWS path). */
  event?: string;
  /** Pre-resolved category (ADR-052 path — pass result of getAlertCategory). */
  category?: ReturnType<typeof getAlertCategory>;
  className?: string;
}): ReactElement {
  const sharedProps: AlertIconProps = { 'aria-hidden': true, className };
  // Prefer the pre-resolved category when supplied; fall back to event-string resolution.
  const category = categoryProp ?? getAlertCategory(event ?? '');

  switch (category) {
    case 'tsunami':      return <Tsunami     {...sharedProps} />;
    case 'flood':        return <Flood       {...sharedProps} />;
    case 'hurricane':    return <Hurricane   {...sharedProps} />;
    case 'tornado':      return <Tornado     {...sharedProps} />;
    case 'fire':         return <Fire        {...sharedProps} />;
    case 'thunderstorm': return <Lightning   {...sharedProps} />;
    case 'winter':       return <Snowflake   {...sharedProps} />;
    case 'heat':         return <Thermometer {...sharedProps} />;
    case 'fog':          return <CloudFog    {...sharedProps} />;
    case 'wind':         return <Wind        {...sharedProps} />;
    case 'marine':       return <Sailboat    {...sharedProps} />;
    case 'earthquake':   return <Earthquake  {...sharedProps} />;
    case 'volcano':      return <Volcano     {...sharedProps} />;
    case 'hail':         return <WeatherHail {...sharedProps} />;
    case 'avalanche':    return <Landslide   {...sharedProps} />;
    case 'dust':
    case 'air-quality':  return <Air         {...sharedProps} />;
    case 'generic':
    default:             return <Warning     {...sharedProps} />;
  }
}
