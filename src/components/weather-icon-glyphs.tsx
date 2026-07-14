/**
 * weather-icon-glyphs.tsx — hero weather icon glyph components.
 *
 * Each function renders a hand-authored SVG file from `public/icons/` via a
 * plain <img> tag. The .svg files are the design source of truth — they are
 * edited directly in Illustrator (see docs/design/icons/) and copied into
 * `public/icons/` for the app to serve as static assets. There is no
 * in-React path/gradient composition here; this file only maps glyph names
 * to their file references.
 *
 * The <img> is decorative (aria-hidden + empty alt) because the consuming
 * `WeatherIcon` component (weather-icon.tsx) renders a sibling
 * <span class="sr-only"> with the translated condition text.
 */

import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GlyphProps {
  /** Rendered pixel size for width and height attributes. */
  size: number;
}

export function GlyphSunny({ size }: GlyphProps): ReactElement {
  return <img src="/icons/clear-day.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphBedtime({ size }: GlyphProps): ReactElement {
  return <img src="/icons/clear-night.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphPartlyCloudy({ size }: GlyphProps): ReactElement {
  return <img src="/icons/partly-cloudy-day.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphPartlyCloudyNight({ size }: GlyphProps): ReactElement {
  return <img src="/icons/partly-cloudy-night.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphMostlyCloudyDay({ size }: GlyphProps): ReactElement {
  return <img src="/icons/mostly-cloudy-day.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphMostlyCloudyNight({ size }: GlyphProps): ReactElement {
  return <img src="/icons/mostly-cloudy-night.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphCloud({ size }: GlyphProps): ReactElement {
  return <img src="/icons/overcast.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphRainy({ size }: GlyphProps): ReactElement {
  return <img src="/icons/rain.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphDrizzle({ size }: GlyphProps): ReactElement {
  return <img src="/icons/drizzle.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphSnowy({ size }: GlyphProps): ReactElement {
  return <img src="/icons/snow.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphWintryMix({ size }: GlyphProps): ReactElement {
  return <img src="/icons/wintry-mix.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphThunderstorm({ size }: GlyphProps): ReactElement {
  return <img src="/icons/thunderstorm.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphFoggy({ size }: GlyphProps): ReactElement {
  return <img src="/icons/fog.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphPartlyCloudyRainDay({ size }: GlyphProps): ReactElement {
  return <img src="/icons/partly-cloudy-rain-day.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphPartlyCloudyRainNight({ size }: GlyphProps): ReactElement {
  return <img src="/icons/partly-cloudy-rain-night.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphPartlyCloudySnowDay({ size }: GlyphProps): ReactElement {
  return <img src="/icons/partly-cloudy-snow-day.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphPartlyCloudySnowNight({ size }: GlyphProps): ReactElement {
  return <img src="/icons/partly-cloudy-snow-night.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphPartlyCloudyWintryMixDay({ size }: GlyphProps): ReactElement {
  return <img src="/icons/partly-cloudy-mix-day.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphPartlyCloudyWintryMixNight({ size }: GlyphProps): ReactElement {
  return <img src="/icons/partly-cloudy-mix-night.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphHazy({ size }: GlyphProps): ReactElement {
  return <img src="/icons/haze-clear-day.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphHazyNight({ size }: GlyphProps): ReactElement {
  return <img src="/icons/haze-clear-night.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphHazyPartlyCloudyDay({ size }: GlyphProps): ReactElement {
  return <img src="/icons/haze-partly-cloudy-day.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphHazyPartlyCloudyNight({ size }: GlyphProps): ReactElement {
  return <img src="/icons/haze-partly-cloudy-night.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphHazyOvercast({ size }: GlyphProps): ReactElement {
  return <img src="/icons/haze-overcast.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphSmokeDay({ size }: GlyphProps): ReactElement {
  return <img src="/icons/smoke-clear-day.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphSmokeNight({ size }: GlyphProps): ReactElement {
  return <img src="/icons/smoke-clear-night.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphSmokePartlyCloudyDay({ size }: GlyphProps): ReactElement {
  return <img src="/icons/smoke-partly-cloudy-day.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphSmokePartlyCloudyNight({ size }: GlyphProps): ReactElement {
  return <img src="/icons/smoke-partly-cloudy-night.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphSmokeOvercast({ size }: GlyphProps): ReactElement {
  return <img src="/icons/smoke-overcast.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphDustDay({ size }: GlyphProps): ReactElement {
  return <img src="/icons/dust-day.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphDustNight({ size }: GlyphProps): ReactElement {
  return <img src="/icons/dust-night.svg" width={size} height={size} alt="" aria-hidden="true" />;
}

export function GlyphDust({ size }: GlyphProps): ReactElement {
  return <img src="/icons/dust-overcast.svg" width={size} height={size} alt="" aria-hidden="true" />;
}
