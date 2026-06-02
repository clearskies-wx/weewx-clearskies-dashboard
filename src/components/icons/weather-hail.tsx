/**
 * WeatherHail — inline SVG for the hail alert icon.
 *
 * Source: material-symbols:weather_hail-outlined (Apache-2.0 — Google Material Symbols)
 * https://fonts.google.com/icons?icon.query=weather_hail
 * viewBox 0 -960 960 960, 960-unit coordinate system, 24×24 display.
 *
 * ADR-052: Phosphor has no weather_hail glyph; this Material Symbols outlined
 * variant is the designated cross-pack exception for the hail alert type.
 *
 * A11y (rules/coding.md §5.5):
 *   - Used as an informational icon within the alert-icon-map.
 *   - aria-hidden here; the alert-banner provides the accessible name via its
 *     role="alert" / role="status" wrapper and visible text label (ADR-052 §5.1).
 */

import type { SVGProps } from 'react';

interface WeatherHailIconProps extends SVGProps<SVGSVGElement> {
  /** Icon size in px (uniform width = height). Default: 20. */
  size?: number;
}

export function WeatherHail({ size = 20, ...props }: WeatherHailIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {/*
        material-symbols:weather_hail-outlined
        Cloud with hailstone pellets falling beneath it.
      */}
      <path d="m500-40-60-60 60-60 60 60-60 60Zm-138-60-42-42 118-118 42 42-118 118Zm258-60-60-60 60-60 60 60-60 60Zm-360 0-60-60 60-60 60 60-60 60Zm40-160q-91 0-155.5-64.5T80-540q0-83 55-145t136-73q32-57 87.5-89.5T480-880q90 0 156.5 57.5T717-679q69 6 116 57t47 122q0 75-52.5 127.5T700-320H300Zm0-80h400q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-40q0-66-47-113t-113-47q-48 0-87.5 26T333-704l-10 24h-25q-57 2-97.5 42.5T160-540q0 58 41 99t99 41Zm180-200Z" />
    </svg>
  );
}
