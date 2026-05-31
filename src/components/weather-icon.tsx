/**
 * WeatherIcon — maps WMO weather interpretation codes to inline Material
 * Symbols SVG with Meteocons-style gradient fills (ADR-049).
 *
 * Replaces the previous Erik Flowers CSS-font approach.  The <svg> element is
 * aria-hidden; a sibling <span class="sr-only"> carries the translated
 * description for screen readers — same pattern as the original component.
 *
 * Night handling (lead call — ADR-049 implementation brief):
 *   - WMO code 0 at night → bedtime (crescent moon).
 *   - All other codes use the same glyph day or night.  Clouds/rain/snow/storm
 *     read correctly without a sun present, and the locked glyph set has no
 *     moon-behind-cloud variant.  Richer night glyphs are a possible future
 *     follow-up; this simplification is intentional.
 */
import { useTranslation } from 'react-i18next';
import {
  GlyphSunny,
  GlyphPartlyCloudy,
  GlyphCloud,
  GlyphFoggy,
  GlyphRainy,
  GlyphSnowy,
  GlyphThunderstorm,
  GlyphBedtime,
} from './weather-icon-glyphs';
import type { ComponentType } from 'react';
import type { GlyphProps } from './weather-icon-glyphs';

// ---------------------------------------------------------------------------
// WMO → glyph mapping
// ---------------------------------------------------------------------------

/**
 * Glyph component type — each builder takes { size } and returns an <svg>.
 * The `night` field optionally overrides the day glyph (only code 0 uses it).
 */
interface GlyphEntry {
  day: ComponentType<GlyphProps>;
  night?: ComponentType<GlyphProps>;
  descriptionKey: string;
}

/**
 * Mapping from WMO weather interpretation code to glyph builder + i18n key.
 * Source: https://open-meteo.com/en/docs (WMO code table)
 * Glyph set: Material Symbols (Apache-2.0), Meteocons-style gradients (ADR-049).
 *
 * Night handling: only code 0 has a dedicated night glyph (bedtime / moon).
 * All other codes use the same glyph regardless of day/night — the locked
 * glyph set has no moon-behind-cloud variant (intentional simplification).
 */
const WMO_MAP: Record<number, GlyphEntry> = {
  // Clear
  0:  { day: GlyphSunny,        night: GlyphBedtime,     descriptionKey: 'wmo.0'  },
  // Mainly clear / partly cloudy
  1:  { day: GlyphPartlyCloudy,                           descriptionKey: 'wmo.1'  },
  2:  { day: GlyphPartlyCloudy,                           descriptionKey: 'wmo.2'  },
  // Overcast
  3:  { day: GlyphCloud,                                  descriptionKey: 'wmo.3'  },
  // Fog / rime fog
  45: { day: GlyphFoggy,                                  descriptionKey: 'wmo.45' },
  48: { day: GlyphFoggy,                                  descriptionKey: 'wmo.48' },
  // Drizzle — light, moderate, dense
  51: { day: GlyphRainy,                                  descriptionKey: 'wmo.51' },
  53: { day: GlyphRainy,                                  descriptionKey: 'wmo.53' },
  55: { day: GlyphRainy,                                  descriptionKey: 'wmo.55' },
  // Freezing drizzle — light, dense
  56: { day: GlyphRainy,                                  descriptionKey: 'wmo.56' },
  57: { day: GlyphRainy,                                  descriptionKey: 'wmo.57' },
  // Rain — slight, moderate, heavy
  61: { day: GlyphRainy,                                  descriptionKey: 'wmo.61' },
  63: { day: GlyphRainy,                                  descriptionKey: 'wmo.63' },
  65: { day: GlyphRainy,                                  descriptionKey: 'wmo.65' },
  // Freezing rain — light, heavy
  66: { day: GlyphRainy,                                  descriptionKey: 'wmo.66' },
  67: { day: GlyphRainy,                                  descriptionKey: 'wmo.67' },
  // Snow — slight, moderate, heavy
  71: { day: GlyphSnowy,                                  descriptionKey: 'wmo.71' },
  73: { day: GlyphSnowy,                                  descriptionKey: 'wmo.73' },
  75: { day: GlyphSnowy,                                  descriptionKey: 'wmo.75' },
  // Snow grains
  77: { day: GlyphSnowy,                                  descriptionKey: 'wmo.77' },
  // Rain showers — slight, moderate, violent
  80: { day: GlyphRainy,                                  descriptionKey: 'wmo.80' },
  81: { day: GlyphRainy,                                  descriptionKey: 'wmo.81' },
  82: { day: GlyphRainy,                                  descriptionKey: 'wmo.82' },
  // Snow showers — slight, heavy
  85: { day: GlyphSnowy,                                  descriptionKey: 'wmo.85' },
  86: { day: GlyphSnowy,                                  descriptionKey: 'wmo.86' },
  // Thunderstorm — slight / moderate
  95: { day: GlyphThunderstorm,                           descriptionKey: 'wmo.95' },
  // Thunderstorm with hail — slight, heavy
  96: { day: GlyphThunderstorm,                           descriptionKey: 'wmo.96' },
  99: { day: GlyphThunderstorm,                           descriptionKey: 'wmo.99' },
};

// ---------------------------------------------------------------------------
// Public component API
// ---------------------------------------------------------------------------

export interface WeatherIconProps {
  /** WMO weather interpretation code (0–99). Pass null when no data. */
  code: number | string | null;
  /** When true, use the night glyph where available (only code 0 currently). */
  isNight?: boolean;
  /**
   * Additional CSS class names applied to the wrapping <span>.
   * Used by consumers for layout/structural utilities (e.g. Tailwind spacing).
   * Note: text-color utilities do not affect gradient-filled SVG paths.
   */
  className?: string;
  /**
   * Icon size in pixels.
   * Accepts a number (e.g. 24) or a CSS string (e.g. "56px", "3rem").
   * Numbers are used directly for the SVG width/height attributes.
   * CSS strings are parsed to a pixel integer; non-parseable values fall
   * back to the default hero size of 96px (ADR-049 locked render).
   */
  size?: number | string;
}

/** Default hero size from the locked mockup (ADR-049). */
const DEFAULT_SIZE_PX = 96;

/** Resolve the size prop to a pixel integer for the SVG width/height. */
function resolveSize(size: number | string | undefined): number {
  if (size === undefined) return DEFAULT_SIZE_PX;
  if (typeof size === 'number') return size;
  const parsed = parseFloat(size);
  return isNaN(parsed) ? DEFAULT_SIZE_PX : parsed;
}

/**
 * Render a Material Symbols SVG glyph for the given WMO code.
 *
 * A11y (rules/coding.md §5.5, ADR-049):
 *   - The <svg> is aria-hidden + focusable="false" (decorative from AT perspective).
 *   - A sibling <span class="sr-only"> carries the translated condition text so
 *     screen readers announce the weather condition without reading SVG internals.
 *   - The pair is wrapped in an inline <span> so consumers can apply className
 *     for layout/spacing.
 *
 * When code is null or unrecognised, nothing is rendered — callers guard with
 * `weatherCode != null` before rendering, matching existing consumer patterns.
 */
export function WeatherIcon({
  code,
  isNight = false,
  className = '',
  size,
}: WeatherIconProps) {
  const { t } = useTranslation('weather');

  const numCode =
    code === null
      ? null
      : typeof code === 'string'
        ? parseInt(code, 10)
        : code;

  const entry =
    numCode !== null && !isNaN(numCode) && numCode in WMO_MAP
      ? WMO_MAP[numCode]
      : null;

  // No recognised code → render nothing (callers guard on null; no "na" glyph).
  if (entry === null) return null;

  const Glyph = isNight && entry.night ? entry.night : entry.day;
  const pxSize = resolveSize(size);
  const description = t(entry.descriptionKey, { defaultValue: entry.descriptionKey });

  return (
    <span className={className || undefined} style={{ display: 'inline-flex' }}>
      {/* SVG is aria-hidden; sr-only sibling carries the accessible label */}
      <Glyph size={pxSize} />
      <span className="sr-only">{description}</span>
    </span>
  );
}

export default WeatherIcon;
