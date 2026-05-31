/**
 * UvIndex — inline SVG for the UV index stat icon.
 *
 * Source: tabler:uv-index (MIT licence — Tabler Icons)
 * https://tabler.io/icons/icon/uv-index
 * viewBox 0 0 24 24, stroke-based, 24×24.
 *
 * ADR-050: this is the one stat icon that Phosphor lacks a clean match for.
 * Phosphor is the base pack; Tabler fills this single gap.
 *
 * A11y (rules/coding.md §5.5):
 *   - When used as an informational icon alongside a label, the parent
 *     element should carry the accessible name; this SVG is aria-hidden.
 *   - When used as a standalone icon-only button, the button needs aria-label.
 */

import type { SVGProps } from 'react';

interface UvIndexIconProps extends SVGProps<SVGSVGElement> {
  /** Icon size in px (uniform width = height). Default: 20. */
  size?: number;
}

export function UvIndex({ size = 20, ...props }: UvIndexIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {/* Half-sun arc above horizon — tabler:uv-index */}
      <path d="M3 12h1m16 0h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7m-9.7 5.7a4 4 0 1 1 8 0" />
      {/* 12 o'clock ray */}
      <path d="M12 4v-1" />
      {/* V glyph (the V in UV) */}
      <path d="M13 16l2 5h1l2 -5" />
      {/* U glyph (the U in UV) */}
      <path d="M6 16v3a2 2 0 1 0 4 0v-3" />
    </svg>
  );
}
