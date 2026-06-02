/**
 * Air — inline SVG for the air quality / dust / wind alert icon.
 *
 * Source: material-symbols:air-outlined (Apache-2.0 — Google Material Symbols)
 * https://fonts.google.com/icons?icon.query=air
 * viewBox 0 -960 960 960, 960-unit coordinate system, 24×24 display.
 *
 * ADR-052: Phosphor has no air glyph matching the NWS "air quality" alert
 * concept; this Material Symbols outlined variant is the designated cross-pack
 * exception for the air/dust/smoke alert type.
 *
 * A11y (rules/coding.md §5.5):
 *   - Used as an informational icon within the alert-icon-map.
 *   - aria-hidden here; the alert-banner provides the accessible name via its
 *     role="alert" / role="status" wrapper and visible text label (ADR-052 §5.1).
 */

import type { SVGProps } from 'react';

interface AirIconProps extends SVGProps<SVGSVGElement> {
  /** Icon size in px (uniform width = height). Default: 20. */
  size?: number;
}

export function Air({ size = 20, ...props }: AirIconProps) {
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
        material-symbols:air-outlined
        Curved wind / airflow lines indicating air movement.
      */}
      <path d="M460-160q-50 0-85-35t-35-85h80q0 17 11.5-28.5T460-240q17 0 28.5-11.5T500-280q0-17-11.5-28.5T460-320H80v-80h380q50 0 85 35t35 85q0 50-35 85t-85 35ZM80-560v-80h540q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43h-80q0-59 40.5-99.5T620-840q59 0 99.5 40.5T760-700q0 59-40.5 99.5T620-560H80Zm660 320v-80q26 0 43-17t17-43q0-26-17-43t-43-17H80v-80h660q59 0 99.5 40.5T880-380q0 59-40.5 99.5T740-240Z" />
    </svg>
  );
}
