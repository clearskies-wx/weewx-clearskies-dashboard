/**
 * Landslide — inline SVG for the landslide alert icon.
 *
 * Source: material-symbols:landslide-outlined (Apache-2.0 — Google Material Symbols)
 * https://fonts.google.com/icons?icon.query=landslide
 * viewBox 0 -960 960 960, 960-unit coordinate system, 24×24 display.
 *
 * ADR-052: Phosphor has no landslide glyph; this Material Symbols outlined
 * variant is the designated cross-pack exception for the landslide alert type.
 *
 * A11y (rules/coding.md §5.5):
 *   - Used as an informational icon within the alert-icon-map.
 *   - aria-hidden here; the alert-banner provides the accessible name via its
 *     role="alert" / role="status" wrapper and visible text label (ADR-052 §5.1).
 */

import type { SVGProps } from 'react';

interface LandslideIconProps extends SVGProps<SVGSVGElement> {
  /** Icon size in px (uniform width = height). Default: 20. */
  size?: number;
}

export function Landslide({ size = 20, ...props }: LandslideIconProps) {
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
        material-symbols:landslide-outlined
        Hillside with earth and debris sliding downward.
      */}
      <path d="M80-80h800L640-400l-200-80-120-160H80v560Zm80-80v-64l80 26 361-120 119 158H160Zm80-122-80-27v-75l80 26 158-52 96 43-254 85Zm500-118 180-80v-160l-180-40-100 80v120l100 80Zm-500-42-80-27v-91h120l65 83-105 35Zm512-51-32-25v-44l40-32 80 18v44l-88 39ZM480-640l200-80v-200l-200-40-120 80v160l120 80Zm9-90-49-33v-74l57-38 103 21v80l-111 44Z" />
    </svg>
  );
}
