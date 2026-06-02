/**
 * Earthquake — inline SVG for the earthquake alert icon.
 *
 * Source: material-symbols:earthquake-outlined (Apache-2.0 — Google Material Symbols)
 * https://fonts.google.com/icons?icon.query=earthquake
 * viewBox 0 -960 960 960, 960-unit coordinate system, 24×24 display.
 *
 * ADR-052: Phosphor has no earthquake glyph; this Material Symbols outlined
 * variant is the designated cross-pack exception for the earthquake alert type.
 *
 * A11y (rules/coding.md §5.5):
 *   - Used as an informational icon within the alert-icon-map.
 *   - aria-hidden here; the alert-banner provides the accessible name via its
 *     role="alert" / role="status" wrapper and visible text label (ADR-052 §5.1).
 */

import type { SVGProps } from 'react';

interface EarthquakeIconProps extends SVGProps<SVGSVGElement> {
  /** Icon size in px (uniform width = height). Default: 20. */
  size?: number;
}

export function Earthquake({ size = 20, ...props }: EarthquakeIconProps) {
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
        material-symbols:earthquake-outlined
        Seismic waveform line indicating ground shaking.
      */}
      <path d="M361-80q-14 0-24.5-7.5T322-108L220-440H80v-80h170q13 0 23.5 7.5T288-492l66 215 127-571q3-14 14-23t25-9q14 0 25 8.5t14 22.5l87 376 56-179q4-13 14.5-20.5T740-680q13 0 23 7t15 19l50 134h52v80h-80q-13 0-23-7t-15-19l-19-51-65 209q-4 13-15 21t-25 7q-14-1-24-9.5T601-311l-81-348-121 548q-3 14-13.5 22T361-80Z" />
    </svg>
  );
}
