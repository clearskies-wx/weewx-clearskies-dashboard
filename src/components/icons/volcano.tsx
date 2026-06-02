/**
 * Volcano — inline SVG for the volcano alert icon.
 *
 * Source: material-symbols:volcano-outlined (Apache-2.0 — Google Material Symbols)
 * https://fonts.google.com/icons?icon.query=volcano
 * viewBox 0 -960 960 960, 960-unit coordinate system, 24×24 display.
 *
 * ADR-052: Phosphor has no volcano glyph; this Material Symbols outlined
 * variant is the designated cross-pack exception for the volcano alert type.
 *
 * A11y (rules/coding.md §5.5):
 *   - Used as an informational icon within the alert-icon-map.
 *   - aria-hidden here; the alert-banner provides the accessible name via its
 *     role="alert" / role="status" wrapper and visible text label (ADR-052 §5.1).
 */

import type { SVGProps } from 'react';

interface VolcanoIconProps extends SVGProps<SVGSVGElement> {
  /** Icon size in px (uniform width = height). Default: 20. */
  size?: number;
}

export function Volcano({ size = 20, ...props }: VolcanoIconProps) {
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
        material-symbols:volcano-outlined
        Mountain silhouette with eruption plume at summit.
      */}
      <path d="m80-80 160-360h120l80-200h280L880-80H80Zm123-80h571L660-560H494l-80 200H292l-89 200Zm317-600v-160h80v160h-80Zm181 75-56-56 113-113 57 56-114 113Zm-282 0L306-798l56-57 113 114-56 56Zm355 525H203h571Z" />
    </svg>
  );
}
