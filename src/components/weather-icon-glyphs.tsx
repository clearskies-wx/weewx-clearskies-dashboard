/**
 * weather-icon-glyphs.tsx — Material Symbols SVG glyph builders.
 *
 * Each function returns a React element containing an <svg> with the locked
 * Meteocons-style gradient treatment (ADR-049).  Path data is copied verbatim
 * from docs/design/mockups/A3-material-gradient.html (the implementation
 * source of truth).
 *
 * Gradient IDs are scoped per-instance using React's useId() hook to avoid
 * collisions when multiple icons appear on the same page (e.g. forecast tabs
 * toggled via display:none — browsers re-resolve url(#id) across the entire
 * document, so global IDs cause all icons to lose their fills).
 * Each glyph function generates a unique prefix and passes it down through
 * GradientDefs and Svg so every gradient ID is document-unique.
 *
 * Icons are static — no SMIL, no CSS animation, no JS motion.  Reduced-motion
 * safe by construction (ADR-049).
 */

import { useId } from 'react';
import type React from 'react';
import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GlyphProps {
  /** Rendered pixel size for width and height attributes. */
  size: number;
}

// ---------------------------------------------------------------------------
// Shared gradient defs — rendered inline inside each SVG so every icon is
// self-contained.  The `p` prefix (from useId) makes every gradient ID
// document-unique, preventing cross-icon fill collisions when multiple
// instances share the same DOM (e.g. hidden forecast tab panels).
// ---------------------------------------------------------------------------

function GradientDefs({ p }: { p: string }): ReactElement {
  return (
    <defs>
      {/* Gold gradient: warm sun / amber — sun circle, rays, lightning bolts */}
      <linearGradient id={`${p}goldGrad`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#FFD24D" />
        <stop offset="100%" stopColor="#F5A623" />
      </linearGradient>
      {/* Grey gradient: cloud volume / depth — lighter at top for depth */}
      <linearGradient id={`${p}greyGrad`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#F3F5F8" />
        <stop offset="100%" stopColor="#C7CDD6" />
      </linearGradient>
      {/* Rain gradient: soft cornflower blue */}
      <linearGradient id={`${p}rainGrad`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#9CCEF5" />
        <stop offset="100%" stopColor="#5BA3DC" />
      </linearGradient>
      {/* Snow gradient: pale icy blue-white */}
      <linearGradient id={`${p}snowGrad`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#E8F4FF" />
        <stop offset="100%" stopColor="#B8D8F5" />
      </linearGradient>
      {/* Moon gradient: Meteocons clear-night soft blue / periwinkle */}
      <linearGradient id={`${p}moonGrad`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#86C3DB" />
        <stop offset="100%" stopColor="#72B9D5" />
      </linearGradient>
      {/* Haze gradient: amber/brown — haze stripes below clipped sun/moon */}
      <linearGradient id={`${p}hazeGrad`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#CDAA6D" />
        <stop offset="100%" stopColor="#A07840" />
      </linearGradient>
      {/* Smoke gradient: darker grey than clouds — smoke wisps */}
      <linearGradient id={`${p}smokeGrad`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#9EA5AD" />
        <stop offset="100%" stopColor="#6B7280" />
      </linearGradient>
      {/* Dust gradient: earth-tone tan/brown — dust particles */}
      <linearGradient id={`${p}dustGrad`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#D4A574" />
        <stop offset="100%" stopColor="#A0734A" />
      </linearGradient>
    </defs>
  );
}

// ---------------------------------------------------------------------------
// Helper — wraps children in a sized SVG with the shared gradient defs.
// ---------------------------------------------------------------------------

// Thin outline on cloud shapes so they don't vanish against light backgrounds.
const CLOUD_STROKE = 'rgba(0,0,0,0.12)';
const CLOUD_STROKE_WIDTH = 0.4;

function Svg({ size, p, children }: { size: number; p: string; children: React.ReactNode }): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <GradientDefs p={p} />
      {children}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 1. Sunny — clear day
//    Single path: sun circle + 8 rays, all gold.
//    Path from material-symbols/sunny.svg via Iconify.
// ---------------------------------------------------------------------------

export function GlyphSunny({ size }: GlyphProps): ReactElement {
  const p = useId();
  const d = 'M11 5V1h2v4zm6.65 2.75l-1.375-1.375l2.8-2.875l1.4 1.425zM19 13v-2h4v2zm-8 10v-4h2v4zM6.35 7.7L3.5 4.925l1.425-1.4L7.75 6.35zm12.7 12.8l-2.775-2.875l1.35-1.35l2.85 2.75zM1 13v-2h4v2zm3.925 7.5l-1.4-1.425l2.8-2.8l.725.675l.725.7zm2.825-4.25Q6 14.5 6 12t1.75-4.25T12 6t4.25 1.75T18 12t-1.75 4.25T12 18t-4.25-1.75';
  return (
    <Svg size={size} p={p}>
      <path fill={`url(#${p}goldGrad)`} d={d} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 2. Partly cloudy — one path for cloud (grey), one for sun+rays (gold).
//
// THE GOTCHA (documented in ADR-049 + the mockup):
//   The sun body subpath originally started with a RELATIVE move 'm8.975-2.8'.
//   In the original single-path compound shape it was relative to the cloud's
//   close-point (6, 20), resolving to absolute (14.975, 17.2).  When split
//   into a separate <path>, the relative move re-anchors to (0,0), shifting
//   the entire sun body off-canvas ("exploded" geometry).
//   Fix: start the gold path at the ABSOLUTE point M14.975 17.2.
//   fill-rule="nonzero" is set explicitly on both paths (matches original).
// ---------------------------------------------------------------------------

export function GlyphPartlyCloudy({ size }: GlyphProps): ReactElement {
  const p = useId();
  // Cloud blob (grey)
  const cloudPath =
    'M6 20q-1.65 0-2.825-1.175T2 16t1.175-2.825T6 12q1.2 0 2.213.65t1.462 1.775l.25.575h.6q1.05 0 1.763.725T13 17.5t-.725 1.775T10.5 20z';
  // Sun body anchored to absolute M14.975 17.2 (was 'm8.975-2.8') + 5 rays (gold)
  const sunPath =
    'M14.975 17.2q-.1-1.575-1.137-2.725t-2.613-1.425q-.775-1.35-2.087-2.137T6.25 10q.65-1.825 2.225-2.912T12 6q2.5 0 4.25 1.75T18 12q0 1.625-.8 3.013T14.975 17.2M11 5V1h2v4zm6.65 2.75l-1.4-1.4l2.8-2.85l1.425 1.425zM19 13v-2h4v2zm.05 7.5l-2.8-2.85l1.4-1.4l2.85 2.8zM6.35 7.75L3.525 4.925L4.95 3.5l2.8 2.85z';
  return (
    <Svg size={size} p={p}>
      <path fillRule="nonzero" fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={cloudPath} />
      <path fillRule="nonzero" fill={`url(#${p}goldGrad)`} d={sunPath} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 2b. Partly cloudy night — cloud (grey) + crescent moon (moon gradient).
//
// Same split-path treatment as GlyphPartlyCloudy but with a moon behind the
// cloud instead of a sun.  Paths from material-symbols/partly_cloudy_night.svg
// via Iconify, then split into cloud blob and moon crescent.
// ---------------------------------------------------------------------------

export function GlyphPartlyCloudyNight({ size }: GlyphProps): ReactElement {
  const p = useId();
  // Cloud blob (grey) — same lower-left position as day variant
  const cloudPath =
    'M6 13q1.2 0 2.2.65t1.475 1.775l.25.575h.625q1.05 0 1.75.738T13 18.5q0 1.05-.725 1.775T10.5 21H6q-1.65 0-2.825-1.175T2 17q0-1.675 1.175-2.838T6 13';
  // Crescent moon (moon gradient) — upper-right, peeking behind the cloud
  const moonPath =
    'M11.25 2q-.45 2.475.275 4.838t2.5 4.137t4.138 2.5T23 13.75q-.65 3.55-3.375 5.863T13.325 22q.8-.65 1.238-1.562T15 18.5q0-1.7-1.062-2.937t-2.713-1.488q-.8-1.425-2.187-2.25T6 11q-.8 0-1.562.2T3 11.8q.05-3.625 2.363-6.375T11.25 2';
  return (
    <Svg size={size} p={p}>
      <path fillRule="nonzero" fill={`url(#${p}moonGrad)`} d={moonPath} />
      <path fillRule="nonzero" fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={cloudPath} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 3. Cloud — overcast
//    Single cloud blob, grey gradient.
//    Path from material-symbols/cloud.svg via Iconify.
// ---------------------------------------------------------------------------

export function GlyphCloud({ size }: GlyphProps): ReactElement {
  const p = useId();
  const d =
    'M6.5 20q-2.275 0-3.887-1.575T1 14.575q0-1.95 1.175-3.475T5.25 9.15q.625-2.3 2.5-3.725T12 4q2.925 0 4.963 2.038T19 11q1.725.2 2.863 1.488T23 15.5q0 1.875-1.312 3.188T18.5 20z';
  return (
    <Svg size={size} p={p}>
      <path fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={d} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 4. Foggy
//    Cloud shape (top) + fog stripe dots, all grey.
//    Path from material-symbols/foggy.svg via Iconify.
// ---------------------------------------------------------------------------

export function GlyphFoggy({ size }: GlyphProps): ReactElement {
  const p = useId();
  const d =
    'M18 19q-.425 0-.712-.288T17 18t.288-.712T18 17t.713.288T19 18t-.288.713T18 19M7 22q-.425 0-.712-.288T6 21t.288-.712T7 20t.713.288T8 21t-.288.713T7 22m-1-3q-.425 0-.712-.288T5 18t.288-.712T6 17h9q.425 0 .713.288T16 18t-.288.713T15 19zm4 3q-.425 0-.712-.288T9 21t.288-.712T10 20h7q.425 0 .713.288T18 21t-.288.713T17 22zm-2.5-6q-2.275 0-3.887-1.612T2 10.5q0-2.075 1.375-3.625t3.4-1.825q.8-1.425 2.188-2.238T12 2q2.25 0 3.913 1.438t2.012 3.587q1.725.15 2.9 1.425T22 11.5q0 1.875-1.312 3.188T17.5 16z';
  return (
    <Svg size={size} p={p}>
      <path fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={d} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 5. Rainy — split: cloud body (grey) + rain drop streaks (rain gradient).
//    Cloud path + 3 angled rain streak subpaths.
//    Paths from material-symbols/rainy.svg via Iconify.
// ---------------------------------------------------------------------------

export function GlyphRainy({ size }: GlyphProps): ReactElement {
  const p = useId();
  const cloudPath =
    'M7.5 16q-2.275 0-3.887-1.612T2 10.5q0-2.075 1.375-3.625t3.4-1.825q.8-1.425 2.188-2.238T12 2q2.25 0 3.913 1.438t2.012 3.587q1.725.15 2.9 1.425T22 11.5q0 1.875-1.312 3.188T17.5 16z';
  const rainPath =
    'M13.95 21.9q-.375.2-.762.063t-.588-.513l-1.5-3q-.2-.375-.062-.762t.512-.588t.763-.062t.587.512l1.5 3q.2.375.063.763t-.513.587m6 0q-.375.2-.762.063t-.588-.513l-1.5-3q-.2-.375-.062-.762t.512-.588t.763-.062t.587.512l1.5 3q.2.375.063.763t-.513.587m-12 0q-.375.2-.762.063T6.6 21.45l-1.5-3q-.2-.375-.062-.762t.512-.588t.763-.062t.587.512l1.5 3q.2.375.063.763t-.513.587';
  return (
    <Svg size={size} p={p}>
      <path fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={cloudPath} />
      <path fill={`url(#${p}rainGrad)`} d={rainPath} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 6. Snowy — split: cloud body (grey) + snow dot particles (snow gradient).
//    Large cloud + 6 dot subpaths.
//    Paths from material-symbols/weather-snowy.svg via Iconify.
// ---------------------------------------------------------------------------

export function GlyphSnowy({ size }: GlyphProps): ReactElement {
  const p = useId();
  const cloudPath =
    'M7.5 15q-2.275 0-3.887-1.612T2 9.5q0-2.075 1.375-3.625t3.4-1.825q.8-1.425 2.188-2.238T12 1q2.25 0 3.913 1.438t2.012 3.587q1.725.15 2.9 1.425T22 10.5q0 1.875-1.312 3.188T17.5 15z';
  const snowPath =
    'M5.613 18.638q-.363-.363-.363-.888t.363-.888t.887-.362t.888.363t.362.887t-.363.888T6.5 19t-.888-.363m3 3q-.362-.362-.362-.887t.363-.888t.887-.362t.888.363t.362.887t-.363.888T9.5 22t-.888-.363m3-3q-.362-.362-.362-.887t.363-.888t.887-.362t.888.363t.362.887t-.363.888T12.5 19t-.888-.363m6 0q-.362-.362-.362-.887t.363-.888t.887-.362t.888.363t.362.887t-.363.888T18.5 19t-.888-.363m-3 3q-.362-.362-.362-.887t.363-.888t.887-.362t.888.363t.362.887t-.363.888T15.5 22t-.888-.363';
  return (
    <Svg size={size} p={p}>
      <path fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={cloudPath} />
      <path fill={`url(#${p}snowGrad)`} d={snowPath} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 7. Thunderstorm — split: cloud body (grey) + 2 lightning bolts (gold).
//    Gold bolts tie to sun gold, unifying the palette.
//    Paths from material-symbols/thunderstorm.svg via Iconify.
// ---------------------------------------------------------------------------

export function GlyphThunderstorm({ size }: GlyphProps): ReactElement {
  const p = useId();
  const cloudPath =
    'M7.5 16q-2.275 0-3.887-1.612T2 10.5q0-2.075 1.375-3.625t3.4-1.825q.8-1.425 2.188-2.238T12 2q2.25 0 3.913 1.438t2.012 3.587q1.725.15 2.9 1.425T22 11.5q0 1.875-1.312 3.188T17.5 16z';
  // Two lightning bolts, gold (same as sun — judgment call to unify the palette)
  const boltPath =
    'm7.5 23l.9-2.5H6.5L7.75 17h2.5l-1.075 2.5h2.075L8.5 23zm6.75-1l.7-2H13l1.075-3h2.5l-.875 2h2.05l-2.5 3z';
  return (
    <Svg size={size} p={p}>
      <path fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={cloudPath} />
      <path fill={`url(#${p}goldGrad)`} d={boltPath} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 8. Bedtime — clear night (crescent moon).
//    Moon gradient: Meteocons clear-night soft blue/periwinkle
//    #86C3DB (top) → #72B9D5 (bottom).
//    Path from material-symbols/bedtime.svg via Iconify.
// ---------------------------------------------------------------------------

export function GlyphBedtime({ size }: GlyphProps): ReactElement {
  const p = useId();
  const d =
    'M12.1 22q-2.1 0-3.937-.8t-3.2-2.162t-2.163-3.2T2 11.9q0-3.65 2.325-6.437T10.25 2q-.45 2.475.275 4.838t2.5 4.137t4.138 2.5T22 13.75q-.65 3.6-3.45 5.925T12.1 22';
  return (
    <Svg size={size} p={p}>
      <path fill={`url(#${p}moonGrad)`} d={d} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 9. Hazy day — clipped sun (top) + fog-style haze stripes (bottom, amber).
//    Sun body clipped at y=16.5; fog stripe bars + dots filled with hazeGrad.
//    Brown stripes visually distinguish haze from grey fog stripes.
// ---------------------------------------------------------------------------

export function GlyphHazy({ size }: GlyphProps): ReactElement {
  const p = useId();
  // Reuse the sunny path from GlyphSunny
  const sunPath = 'M11 5V1h2v4zm6.65 2.75l-1.375-1.375l2.8-2.875l1.4 1.425zM19 13v-2h4v2zm-8 10v-4h2v4zM6.35 7.7L3.5 4.925l1.425-1.4L7.75 6.35zm12.7 12.8l-2.775-2.875l1.35-1.35l2.85 2.75zM1 13v-2h4v2zm3.925 7.5l-1.4-1.425l2.8-2.8l.725.675l.725.7zm2.825-4.25Q6 14.5 6 12t1.75-4.25T12 6t4.25 1.75T18 12t-1.75 4.25T12 18t-4.25-1.75';
  // Fog stripe subpaths (from foggy.svg, absolute coordinates)
  const hazePaths = [
    'M6 19q-.425 0-.712-.288T5 18t.288-.712T6 17h9q.425 0 .713.288T16 18t-.288.713T15 19z',
    'M18 19q-.425 0-.712-.288T17 18t.288-.712T18 17t.713.288T19 18t-.288.713T18 19',
    'M10 22q-.425 0-.712-.288T9 21t.288-.712T10 20h7q.425 0 .713.288T18 21t-.288.713T17 22z',
    'M7 22q-.425 0-.712-.288T6 21t.288-.712T7 20t.713.288T8 21t-.288.713T7 22',
  ];
  return (
    <Svg size={size} p={p}>
      <defs>
        <clipPath id={`${p}hazeClip`}>
          <rect x="0" y="0" width="24" height="16.5" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${p}hazeClip)`}>
        <path fill={`url(#${p}goldGrad)`} d={sunPath} />
      </g>
      {hazePaths.map((d, i) => (
        <path key={i} fill={`url(#${p}hazeGrad)`} d={d} />
      ))}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 10. Hazy night — clipped crescent moon (top) + fog-style haze stripes (bottom, amber).
//     Moon body clipped at y=16.5; same haze stripe paths as day variant.
// ---------------------------------------------------------------------------

export function GlyphHazyNight({ size }: GlyphProps): ReactElement {
  const p = useId();
  // Reuse the bedtime moon path from GlyphBedtime
  const moonPath = 'M12.1 22q-2.1 0-3.937-.8t-3.2-2.162t-2.163-3.2T2 11.9q0-3.65 2.325-6.437T10.25 2q-.45 2.475.275 4.838t2.5 4.137t4.138 2.5T22 13.75q-.65 3.6-3.45 5.925T12.1 22';
  const hazePaths = [
    'M6 19q-.425 0-.712-.288T5 18t.288-.712T6 17h9q.425 0 .713.288T16 18t-.288.713T15 19z',
    'M18 19q-.425 0-.712-.288T17 18t.288-.712T18 17t.713.288T19 18t-.288.713T18 19',
    'M10 22q-.425 0-.712-.288T9 21t.288-.712T10 20h7q.425 0 .713.288T18 21t-.288.713T17 22z',
    'M7 22q-.425 0-.712-.288T6 21t.288-.712T7 20t.713.288T8 21t-.288.713T7 22',
  ];
  return (
    <Svg size={size} p={p}>
      <defs>
        <clipPath id={`${p}hazeClipN`}>
          <rect x="0" y="0" width="24" height="16.5" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${p}hazeClipN)`}>
        <path fill={`url(#${p}moonGrad)`} d={moonPath} />
      </g>
      {hazePaths.map((d, i) => (
        <path key={i} fill={`url(#${p}hazeGrad)`} d={d} />
      ))}
    </Svg>
  );
}

// ===========================================================================
// Shared path constants — reused across the new glyph functions below.
// Existing glyph functions define their own local copies; new glyphs
// reference these module-level constants to avoid ~21x duplication.
// ===========================================================================

/** Sun path (Material Symbols sunny.svg) — same d as GlyphSunny. */
const SUN_D =
  'M11 5V1h2v4zm6.65 2.75l-1.375-1.375l2.8-2.875l1.4 1.425zM19 13v-2h4v2zm-8 10v-4h2v4zM6.35 7.7L3.5 4.925l1.425-1.4L7.75 6.35zm12.7 12.8l-2.775-2.875l1.35-1.35l2.85 2.75zM1 13v-2h4v2zm3.925 7.5l-1.4-1.425l2.8-2.8l.725.675l.725.7zm2.825-4.25Q6 14.5 6 12t1.75-4.25T12 6t4.25 1.75T18 12t-1.75 4.25T12 18t-4.25-1.75';

/** Moon path (Material Symbols bedtime.svg) — same d as GlyphBedtime. */
const MOON_D =
  'M12.1 22q-2.1 0-3.937-.8t-3.2-2.162t-2.163-3.2T2 11.9q0-3.65 2.325-6.437T10.25 2q-.45 2.475.275 4.838t2.5 4.137t4.138 2.5T22 13.75q-.65 3.6-3.45 5.925T12.1 22';

/** Overcast cloud path (Material Symbols cloud.svg) — same d as GlyphCloud. */
const CLOUD_D =
  'M6.5 20q-2.275 0-3.887-1.575T1 14.575q0-1.95 1.175-3.475T5.25 9.15q.625-2.3 2.5-3.725T12 4q2.925 0 4.963 2.038T19 11q1.725.2 2.863 1.488T23 15.5q0 1.875-1.312 3.188T18.5 20z';

/** Rain cloud path (Material Symbols rainy.svg cloud portion). */
const RAIN_CLOUD_D =
  'M7.5 16q-2.275 0-3.887-1.612T2 10.5q0-2.075 1.375-3.625t3.4-1.825q.8-1.425 2.188-2.238T12 2q2.25 0 3.913 1.438t2.012 3.587q1.725.15 2.9 1.425T22 11.5q0 1.875-1.312 3.188T17.5 16z';

/** Partly cloudy day — cloud blob (grey). */
const PC_CLOUD_D =
  'M6 20q-1.65 0-2.825-1.175T2 16t1.175-2.825T6 12q1.2 0 2.213.65t1.462 1.775l.25.575h.6q1.05 0 1.763.725T13 17.5t-.725 1.775T10.5 20z';

/** Partly cloudy day — sun body + 5 rays (gold). */
const PC_SUN_D =
  'M14.975 17.2q-.1-1.575-1.137-2.725t-2.613-1.425q-.775-1.35-2.087-2.137T6.25 10q.65-1.825 2.225-2.912T12 6q2.5 0 4.25 1.75T18 12q0 1.625-.8 3.013T14.975 17.2M11 5V1h2v4zm6.65 2.75l-1.4-1.4l2.8-2.85l1.425 1.425zM19 13v-2h4v2zm.05 7.5l-2.8-2.85l1.4-1.4l2.85 2.8zM6.35 7.75L3.525 4.925L4.95 3.5l2.8 2.85z';

/** Partly cloudy night — cloud blob (grey). */
const PCN_CLOUD_D =
  'M6 13q1.2 0 2.2.65t1.475 1.775l.25.575h.625q1.05 0 1.75.738T13 18.5q0 1.05-.725 1.775T10.5 21H6q-1.65 0-2.825-1.175T2 17q0-1.675 1.175-2.838T6 13';

/** Partly cloudy night — crescent moon (moon gradient). */
const PCN_MOON_D =
  'M11.25 2q-.45 2.475.275 4.838t2.5 4.137t4.138 2.5T23 13.75q-.65 3.55-3.375 5.863T13.325 22q.8-.65 1.238-1.562T15 18.5q0-1.7-1.062-2.937t-2.713-1.488q-.8-1.425-2.187-2.25T6 11q-.8 0-1.562.2T3 11.8q.05-3.625 2.363-6.375T11.25 2';

/** Haze stripe paths — fog-bar shapes below the clipped sky element. */
const HAZE_STRIPE_PATHS = [
  'M6 19q-.425 0-.712-.288T5 18t.288-.712T6 17h9q.425 0 .713.288T16 18t-.288.713T15 19z',
  'M18 19q-.425 0-.712-.288T17 18t.288-.712T18 17t.713.288T19 18t-.288.713T18 19',
  'M10 22q-.425 0-.712-.288T9 21t.288-.712T10 20h7q.425 0 .713.288T18 21t-.288.713T17 22z',
  'M7 22q-.425 0-.712-.288T6 21t.288-.712T7 20t.713.288T8 21t-.288.713T7 22',
];

// ---------------------------------------------------------------------------
// Private helper components — reusable primitive groups for new-icon
// composition.  Not exported; used only within glyph functions in this file.
// ---------------------------------------------------------------------------

/** Smoke wisp cluster — 4 circles overlaid on the bottom third of the icon. */
function SmokeBubbles({ p }: { p: string }): ReactElement {
  return (
    <>
      <circle cx={8.5} cy={18.3} r={2.1} opacity={0.88} fill={`url(#${p}smokeGrad)`} />
      <circle cx={13.6} cy={16.4} r={1.5} opacity={0.82} fill={`url(#${p}smokeGrad)`} />
      <circle cx={11.3} cy={20.9} r={1.15} opacity={0.78} fill={`url(#${p}smokeGrad)`} />
      <circle cx={16.1} cy={19.6} r={1.7} opacity={0.82} fill={`url(#${p}smokeGrad)`} />
    </>
  );
}

/** Snowflake — 6-armed asterisk to distinguish snow from drizzle dots. */
function Snowflake({ cx, cy, r, grad }: { cx: number; cy: number; r: number; grad: string }): ReactElement {
  const dx = r * 0.866;
  const dy = r * 0.5;
  const d = `M${cx} ${cy - r}L${cx} ${cy + r}M${cx - dx} ${cy - dy}L${cx + dx} ${cy + dy}M${cx - dx} ${cy + dy}L${cx + dx} ${cy - dy}`;
  return <path d={d} stroke={grad} strokeWidth={0.7} strokeLinecap="round" fill="none" />;
}

/**
 * Dust particle staircase — diagonal pattern from lower-left to upper-right,
 * matching Meteocons dust composition (paired circles stepping diagonally).
 * 10 circles at r=0.75, 5 pairs stepping from (9,19) to (19,7).
 * Spans x=9-19, y=7-19 — fills the lower-right half of the viewBox.
 */
function DustStaircase({ p }: { p: string }): ReactElement {
  const f = `url(#${p}dustGrad)`;
  return (
    <>
      <circle cx={9} cy={19} r={0.75} fill={f} />
      <circle cx={11} cy={19} r={0.75} fill={f} />
      <circle cx={11} cy={16} r={0.75} fill={f} />
      <circle cx={13} cy={16} r={0.75} fill={f} />
      <circle cx={13} cy={13} r={0.75} fill={f} />
      <circle cx={15} cy={13} r={0.75} fill={f} />
      <circle cx={15} cy={10} r={0.75} fill={f} />
      <circle cx={17} cy={10} r={0.75} fill={f} />
      <circle cx={17} cy={7} r={0.75} fill={f} />
      <circle cx={19} cy={7} r={0.75} fill={f} />
    </>
  );
}

// ===========================================================================
// 12. Mostly cloudy day — sun scaled 70%, peeking from behind overcast cloud.
//     Uses clipPath with clip-rule="evenodd" to cut out the cloud shape from
//     the sun — same cutout approach as the partly cloudy icons' compound
//     paths, but applied via clipping since the overcast cloud path differs
//     from the partly-cloudy cloud.
// ===========================================================================

export function GlyphMostlyCloudyDay({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <defs>
        <clipPath id={`${p}mcClipD`}>
          <path d={`M0 0h24v24H0z ${CLOUD_D}`} clipRule="evenodd" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${p}mcClipD)`}>
        <g transform="translate(4,-2) scale(0.7)">
          <path fill={`url(#${p}goldGrad)`} d={SUN_D} />
        </g>
      </g>
      <path fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={CLOUD_D} />
    </Svg>
  );
}

// ===========================================================================
// 13. Mostly cloudy night — moon scaled 70%, peeking from behind overcast
//     cloud.  Same clipPath cutout as day variant.
// ===========================================================================

export function GlyphMostlyCloudyNight({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <defs>
        <clipPath id={`${p}mcClipN`}>
          <path d={`M0 0h24v24H0z ${CLOUD_D}`} clipRule="evenodd" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${p}mcClipN)`}>
        <g transform="translate(4,-2) scale(0.7)">
          <path fill={`url(#${p}moonGrad)`} d={MOON_D} />
        </g>
      </g>
      <path fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={CLOUD_D} />
    </Svg>
  );
}

// ===========================================================================
// 14. Drizzle — rain cloud + 4 round dots (lighter than rain streaks).
//     Uses <circle> elements per the mockup, not <path>.
// ===========================================================================

export function GlyphDrizzle({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <path fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={RAIN_CLOUD_D} />
      <circle cx={7} cy={20} r={0.9} fill={`url(#${p}rainGrad)`} />
      <circle cx={11} cy={21.5} r={0.9} fill={`url(#${p}rainGrad)`} />
      <circle cx={15} cy={20} r={0.9} fill={`url(#${p}rainGrad)`} />
      <circle cx={19} cy={21.5} r={0.9} fill={`url(#${p}rainGrad)`} />
    </Svg>
  );
}

// ===========================================================================
// 15. Wintry mix — rain cloud + alternating rain streaks and snowflakes.
//     Serves freezing rain, sleet, and rain/snow mix.
// ===========================================================================

export function GlyphWintryMix({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <path fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={RAIN_CLOUD_D} />
      <rect x={-0.55} y={-1.8} width={1.1} height={3.6} rx={0.55} fill={`url(#${p}rainGrad)`} transform="translate(7 19) rotate(18)" />
      <Snowflake cx={10.5} cy={20.5} r={1.1} grad={`url(#${p}snowGrad)`} />
      <rect x={-0.55} y={-1.8} width={1.1} height={3.6} rx={0.55} fill={`url(#${p}rainGrad)`} transform="translate(14 19) rotate(18)" />
      <Snowflake cx={17.5} cy={20.5} r={1.1} grad={`url(#${p}snowGrad)`} />
      <rect x={-0.55} y={-1.8} width={1.1} height={3.6} rx={0.55} fill={`url(#${p}rainGrad)`} transform="translate(20 19) rotate(18)" />
    </Svg>
  );
}

// ===========================================================================
// 16–21. Combined sky + precipitation — partly-cloudy cloud+sun/moon group
//        scaled to 80% and shifted up, with precipitation elements below.
// ===========================================================================

export function GlyphPartlyCloudyRainDay({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <g transform="translate(0,-1.5) scale(0.9)">
        <path fillRule="nonzero" fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={PC_CLOUD_D} />
        <path fillRule="nonzero" fill={`url(#${p}goldGrad)`} d={PC_SUN_D} />
      </g>
      <rect x={-0.55} y={-1.8} width={1.1} height={3.6} rx={0.55} fill={`url(#${p}rainGrad)`} transform="translate(5 18.5) rotate(18)" />
      <rect x={-0.55} y={-1.8} width={1.1} height={3.6} rx={0.55} fill={`url(#${p}rainGrad)`} transform="translate(8.5 20) rotate(18)" />
      <rect x={-0.55} y={-1.8} width={1.1} height={3.6} rx={0.55} fill={`url(#${p}rainGrad)`} transform="translate(12 18.5) rotate(18)" />
    </Svg>
  );
}

export function GlyphPartlyCloudyRainNight({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <g transform="translate(0,-1.5) scale(0.9)">
        <path fillRule="nonzero" fill={`url(#${p}moonGrad)`} d={PCN_MOON_D} />
        <path fillRule="nonzero" fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={PCN_CLOUD_D} />
      </g>
      <rect x={-0.55} y={-1.8} width={1.1} height={3.6} rx={0.55} fill={`url(#${p}rainGrad)`} transform="translate(5 18.5) rotate(18)" />
      <rect x={-0.55} y={-1.8} width={1.1} height={3.6} rx={0.55} fill={`url(#${p}rainGrad)`} transform="translate(8.5 20) rotate(18)" />
      <rect x={-0.55} y={-1.8} width={1.1} height={3.6} rx={0.55} fill={`url(#${p}rainGrad)`} transform="translate(12 18.5) rotate(18)" />
    </Svg>
  );
}

export function GlyphPartlyCloudySnowDay({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <g transform="translate(0,-1.5) scale(0.9)">
        <path fillRule="nonzero" fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={PC_CLOUD_D} />
        <path fillRule="nonzero" fill={`url(#${p}goldGrad)`} d={PC_SUN_D} />
      </g>
      <Snowflake cx={5.5} cy={19} r={1.1} grad={`url(#${p}snowGrad)`} />
      <Snowflake cx={9} cy={20.5} r={1.1} grad={`url(#${p}snowGrad)`} />
      <Snowflake cx={12.5} cy={19} r={1.1} grad={`url(#${p}snowGrad)`} />
    </Svg>
  );
}

export function GlyphPartlyCloudySnowNight({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <g transform="translate(0,-1.5) scale(0.9)">
        <path fillRule="nonzero" fill={`url(#${p}moonGrad)`} d={PCN_MOON_D} />
        <path fillRule="nonzero" fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={PCN_CLOUD_D} />
      </g>
      <Snowflake cx={5.5} cy={19} r={1.1} grad={`url(#${p}snowGrad)`} />
      <Snowflake cx={9} cy={20.5} r={1.1} grad={`url(#${p}snowGrad)`} />
      <Snowflake cx={12.5} cy={19} r={1.1} grad={`url(#${p}snowGrad)`} />
    </Svg>
  );
}

export function GlyphPartlyCloudyWintryMixDay({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <g transform="translate(0,-1.5) scale(0.9)">
        <path fillRule="nonzero" fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={PC_CLOUD_D} />
        <path fillRule="nonzero" fill={`url(#${p}goldGrad)`} d={PC_SUN_D} />
      </g>
      <rect x={-0.55} y={-1.8} width={1.1} height={3.6} rx={0.55} fill={`url(#${p}rainGrad)`} transform="translate(5 18.5) rotate(18)" />
      <Snowflake cx={8.5} cy={20} r={1.1} grad={`url(#${p}snowGrad)`} />
      <rect x={-0.55} y={-1.8} width={1.1} height={3.6} rx={0.55} fill={`url(#${p}rainGrad)`} transform="translate(11 18.5) rotate(18)" />
      <Snowflake cx={14} cy={20} r={1.1} grad={`url(#${p}snowGrad)`} />
    </Svg>
  );
}

export function GlyphPartlyCloudyWintryMixNight({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <g transform="translate(0,-1.5) scale(0.9)">
        <path fillRule="nonzero" fill={`url(#${p}moonGrad)`} d={PCN_MOON_D} />
        <path fillRule="nonzero" fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={PCN_CLOUD_D} />
      </g>
      <rect x={-0.55} y={-1.8} width={1.1} height={3.6} rx={0.55} fill={`url(#${p}rainGrad)`} transform="translate(5 18.5) rotate(18)" />
      <Snowflake cx={8.5} cy={20} r={1.1} grad={`url(#${p}snowGrad)`} />
      <rect x={-0.55} y={-1.8} width={1.1} height={3.6} rx={0.55} fill={`url(#${p}rainGrad)`} transform="translate(11 18.5) rotate(18)" />
      <Snowflake cx={14} cy={20} r={1.1} grad={`url(#${p}snowGrad)`} />
    </Svg>
  );
}

// ===========================================================================
// 22–26. Smoke overlays — smoke bubbles OVERLAID on intact base icon.
//        The base icon stays complete; smoke is additive.
// ===========================================================================

export function GlyphSmokeDay({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <path fill={`url(#${p}goldGrad)`} d={SUN_D} />
      <SmokeBubbles p={p} />
    </Svg>
  );
}

export function GlyphSmokeNight({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <path fill={`url(#${p}moonGrad)`} d={MOON_D} />
      <SmokeBubbles p={p} />
    </Svg>
  );
}

export function GlyphSmokePartlyCloudyDay({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <path fillRule="nonzero" fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={PC_CLOUD_D} />
      <path fillRule="nonzero" fill={`url(#${p}goldGrad)`} d={PC_SUN_D} />
      <SmokeBubbles p={p} />
    </Svg>
  );
}

export function GlyphSmokePartlyCloudyNight({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <path fillRule="nonzero" fill={`url(#${p}moonGrad)`} d={PCN_MOON_D} />
      <path fillRule="nonzero" fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={PCN_CLOUD_D} />
      <SmokeBubbles p={p} />
    </Svg>
  );
}

export function GlyphSmokeOvercast({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <path fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={CLOUD_D} />
      <SmokeBubbles p={p} />
    </Svg>
  );
}

// ===========================================================================
// 27–29. Dust — Meteocons diagonal composition: full-size sky element masked
//        to upper-left triangle, dust staircase in lower-right diagonal.
// ===========================================================================

export function GlyphDustDay({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <defs>
        <mask id={`${p}dustMaskD`}>
          <path d="M0 0h24L0 24z" fill="white" />
        </mask>
      </defs>
      <g mask={`url(#${p}dustMaskD)`}>
        <path fill={`url(#${p}goldGrad)`} d={SUN_D} />
      </g>
      <DustStaircase p={p} />
    </Svg>
  );
}

export function GlyphDustNight({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <defs>
        <mask id={`${p}dustMaskN`}>
          <path d="M0 0h24L0 24z" fill="white" />
        </mask>
      </defs>
      <g mask={`url(#${p}dustMaskN)`}>
        <path fill={`url(#${p}moonGrad)`} d={MOON_D} />
      </g>
      <DustStaircase p={p} />
    </Svg>
  );
}

export function GlyphDust({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <defs>
        <mask id={`${p}dustMaskC`}>
          <path d="M0 0h24L0 24z" fill="white" />
        </mask>
      </defs>
      <g mask={`url(#${p}dustMaskC)`}>
        <path fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={CLOUD_D} />
      </g>
      <DustStaircase p={p} />
    </Svg>
  );
}

// ===========================================================================
// 30–32. Haze cloud-cover variants — same cutout technique as GlyphHazy /
//        GlyphHazyNight: clip the sky element at y=16.5, render amber haze
//        stripes below.
// ===========================================================================

export function GlyphHazyPartlyCloudyDay({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <defs>
        <clipPath id={`${p}hazeClipPCD`}>
          <rect x="0" y="0" width="24" height="16.5" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${p}hazeClipPCD)`}>
        <path fillRule="nonzero" fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={PC_CLOUD_D} />
        <path fillRule="nonzero" fill={`url(#${p}goldGrad)`} d={PC_SUN_D} />
      </g>
      {HAZE_STRIPE_PATHS.map((d, i) => (
        <path key={i} fill={`url(#${p}hazeGrad)`} d={d} />
      ))}
    </Svg>
  );
}

export function GlyphHazyPartlyCloudyNight({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <defs>
        <clipPath id={`${p}hazeClipPCN`}>
          <rect x="0" y="0" width="24" height="16.5" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${p}hazeClipPCN)`}>
        <path fillRule="nonzero" fill={`url(#${p}moonGrad)`} d={PCN_MOON_D} />
        <path fillRule="nonzero" fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={PCN_CLOUD_D} />
      </g>
      {HAZE_STRIPE_PATHS.map((d, i) => (
        <path key={i} fill={`url(#${p}hazeGrad)`} d={d} />
      ))}
    </Svg>
  );
}

export function GlyphHazyOvercast({ size }: GlyphProps): ReactElement {
  const p = useId();
  return (
    <Svg size={size} p={p}>
      <defs>
        <clipPath id={`${p}hazeClipOC`}>
          <rect x="0" y="0" width="24" height="16.5" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${p}hazeClipOC)`}>
        <path fill={`url(#${p}greyGrad)`} stroke={CLOUD_STROKE} strokeWidth={CLOUD_STROKE_WIDTH} d={CLOUD_D} />
      </g>
      {HAZE_STRIPE_PATHS.map((d, i) => (
        <path key={i} fill={`url(#${p}hazeGrad)`} d={d} />
      ))}
    </Svg>
  );
}
