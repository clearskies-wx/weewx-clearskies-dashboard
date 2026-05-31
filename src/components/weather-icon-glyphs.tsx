/**
 * weather-icon-glyphs.tsx — Material Symbols SVG glyph builders.
 *
 * Each function returns a React element containing an <svg> with the locked
 * Meteocons-style gradient treatment (ADR-049).  Path data is copied verbatim
 * from docs/design/mockups/A3-material-gradient.html (the implementation
 * source of truth).
 *
 * Gradient IDs are global-stable (goldGrad, greyGrad, rainGrad, snowGrad,
 * moonGrad).  The shared <GradientDefs> component MUST be rendered once per
 * page (or once per SVG for isolated use) before any glyph is rendered.
 * In weather-icon.tsx the defs are inlined into each SVG so every icon is
 * self-contained and safe in portals / multiple component instances.
 *
 * Icons are static — no SMIL, no CSS animation, no JS motion.  Reduced-motion
 * safe by construction (ADR-049).
 */

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
// self-contained.  IDs are stable globals; values are identical across all
// instances, so duplicate definitions are harmless per SVG spec.
// ---------------------------------------------------------------------------

function GradientDefs(): ReactElement {
  return (
    <defs>
      {/* Gold gradient: warm sun / amber — sun circle, rays, lightning bolts */}
      <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#FFD24D" />
        <stop offset="100%" stopColor="#F5A623" />
      </linearGradient>
      {/* Grey gradient: cloud volume / depth — lighter at top for depth */}
      <linearGradient id="greyGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#F3F5F8" />
        <stop offset="100%" stopColor="#C7CDD6" />
      </linearGradient>
      {/* Rain gradient: soft cornflower blue */}
      <linearGradient id="rainGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#9CCEF5" />
        <stop offset="100%" stopColor="#5BA3DC" />
      </linearGradient>
      {/* Snow gradient: pale icy blue-white */}
      <linearGradient id="snowGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#E8F4FF" />
        <stop offset="100%" stopColor="#B8D8F5" />
      </linearGradient>
      {/* Moon gradient: Meteocons clear-night soft blue / periwinkle */}
      <linearGradient id="moonGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="#86C3DB" />
        <stop offset="100%" stopColor="#72B9D5" />
      </linearGradient>
    </defs>
  );
}

// ---------------------------------------------------------------------------
// Helper — wraps children in a sized SVG with the shared gradient defs.
// ---------------------------------------------------------------------------

function Svg({ size, children }: { size: number; children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <GradientDefs />
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
  const d = 'M11 5V1h2v4zm6.65 2.75l-1.375-1.375l2.8-2.875l1.4 1.425zM19 13v-2h4v2zm-8 10v-4h2v4zM6.35 7.7L3.5 4.925l1.425-1.4L7.75 6.35zm12.7 12.8l-2.775-2.875l1.35-1.35l2.85 2.75zM1 13v-2h4v2zm3.925 7.5l-1.4-1.425l2.8-2.8l.725.675l.725.7zm2.825-4.25Q6 14.5 6 12t1.75-4.25T12 6t4.25 1.75T18 12t-1.75 4.25T12 18t-4.25-1.75';
  return (
    <Svg size={size}>
      <path fill="url(#goldGrad)" d={d} />
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
  // Cloud blob (grey)
  const cloudPath =
    'M6 20q-1.65 0-2.825-1.175T2 16t1.175-2.825T6 12q1.2 0 2.213.65t1.462 1.775l.25.575h.6q1.05 0 1.763.725T13 17.5t-.725 1.775T10.5 20z';
  // Sun body anchored to absolute M14.975 17.2 (was 'm8.975-2.8') + 5 rays (gold)
  const sunPath =
    'M14.975 17.2q-.1-1.575-1.137-2.725t-2.613-1.425q-.775-1.35-2.087-2.137T6.25 10q.65-1.825 2.225-2.912T12 6q2.5 0 4.25 1.75T18 12q0 1.625-.8 3.013T14.975 17.2M11 5V1h2v4zm6.65 2.75l-1.4-1.4l2.8-2.85l1.425 1.425zM19 13v-2h4v2zm.05 7.5l-2.8-2.85l1.4-1.4l2.85 2.8zM6.35 7.75L3.525 4.925L4.95 3.5l2.8 2.85z';
  return (
    <Svg size={size}>
      <path fillRule="nonzero" fill="url(#greyGrad)" d={cloudPath} />
      <path fillRule="nonzero" fill="url(#goldGrad)" d={sunPath} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 3. Cloud — overcast
//    Single cloud blob, grey gradient.
//    Path from material-symbols/cloud.svg via Iconify.
// ---------------------------------------------------------------------------

export function GlyphCloud({ size }: GlyphProps): ReactElement {
  const d =
    'M6.5 20q-2.275 0-3.887-1.575T1 14.575q0-1.95 1.175-3.475T5.25 9.15q.625-2.3 2.5-3.725T12 4q2.925 0 4.963 2.038T19 11q1.725.2 2.863 1.488T23 15.5q0 1.875-1.312 3.188T18.5 20z';
  return (
    <Svg size={size}>
      <path fill="url(#greyGrad)" d={d} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 4. Foggy
//    Cloud shape (top) + fog stripe dots, all grey.
//    Path from material-symbols/foggy.svg via Iconify.
// ---------------------------------------------------------------------------

export function GlyphFoggy({ size }: GlyphProps): ReactElement {
  const d =
    'M18 19q-.425 0-.712-.288T17 18t.288-.712T18 17t.713.288T19 18t-.288.713T18 19M7 22q-.425 0-.712-.288T6 21t.288-.712T7 20t.713.288T8 21t-.288.713T7 22m-1-3q-.425 0-.712-.288T5 18t.288-.712T6 17h9q.425 0 .713.288T16 18t-.288.713T15 19zm4 3q-.425 0-.712-.288T9 21t.288-.712T10 20h7q.425 0 .713.288T18 21t-.288.713T17 22zm-2.5-6q-2.275 0-3.887-1.612T2 10.5q0-2.075 1.375-3.625t3.4-1.825q.8-1.425 2.188-2.238T12 2q2.25 0 3.913 1.438t2.012 3.587q1.725.15 2.9 1.425T22 11.5q0 1.875-1.312 3.188T17.5 16z';
  return (
    <Svg size={size}>
      <path fill="url(#greyGrad)" d={d} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 5. Rainy — split: cloud body (grey) + rain drop streaks (rain gradient).
//    Cloud path + 3 angled rain streak subpaths.
//    Paths from material-symbols/rainy.svg via Iconify.
// ---------------------------------------------------------------------------

export function GlyphRainy({ size }: GlyphProps): ReactElement {
  const cloudPath =
    'M7.5 16q-2.275 0-3.887-1.612T2 10.5q0-2.075 1.375-3.625t3.4-1.825q.8-1.425 2.188-2.238T12 2q2.25 0 3.913 1.438t2.012 3.587q1.725.15 2.9 1.425T22 11.5q0 1.875-1.312 3.188T17.5 16z';
  const rainPath =
    'M13.95 21.9q-.375.2-.762.063t-.588-.513l-1.5-3q-.2-.375-.062-.762t.512-.588t.763-.062t.587.512l1.5 3q.2.375.063.763t-.513.587m6 0q-.375.2-.762.063t-.588-.513l-1.5-3q-.2-.375-.062-.762t.512-.588t.763-.062t.587.512l1.5 3q.2.375.063.763t-.513.587m-12 0q-.375.2-.762.063T6.6 21.45l-1.5-3q-.2-.375-.062-.762t.512-.588t.763-.062t.587.512l1.5 3q.2.375.063.763t-.513.587';
  return (
    <Svg size={size}>
      <path fill="url(#greyGrad)" d={cloudPath} />
      <path fill="url(#rainGrad)" d={rainPath} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 6. Snowy — split: cloud body (grey) + snow dot particles (snow gradient).
//    Large cloud + 6 dot subpaths.
//    Paths from material-symbols/weather-snowy.svg via Iconify.
// ---------------------------------------------------------------------------

export function GlyphSnowy({ size }: GlyphProps): ReactElement {
  const cloudPath =
    'M7.5 15q-2.275 0-3.887-1.612T2 9.5q0-2.075 1.375-3.625t3.4-1.825q.8-1.425 2.188-2.238T12 1q2.25 0 3.913 1.438t2.012 3.587q1.725.15 2.9 1.425T22 10.5q0 1.875-1.312 3.188T17.5 15z';
  const snowPath =
    'M5.613 18.638q-.363-.363-.363-.888t.363-.888t.887-.362t.888.363t.362.887t-.363.888T6.5 19t-.888-.363m3 3q-.362-.362-.362-.887t.363-.888t.887-.362t.888.363t.362.887t-.363.888T9.5 22t-.888-.363m3-3q-.362-.362-.362-.887t.363-.888t.887-.362t.888.363t.362.887t-.363.888T12.5 19t-.888-.363m6 0q-.362-.362-.362-.887t.363-.888t.887-.362t.888.363t.362.887t-.363.888T18.5 19t-.888-.363m-3 3q-.362-.362-.362-.887t.363-.888t.887-.362t.888.363t.362.887t-.363.888T15.5 22t-.888-.363';
  return (
    <Svg size={size}>
      <path fill="url(#greyGrad)" d={cloudPath} />
      <path fill="url(#snowGrad)" d={snowPath} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// 7. Thunderstorm — split: cloud body (grey) + 2 lightning bolts (gold).
//    Gold bolts tie to sun gold, unifying the palette.
//    Paths from material-symbols/thunderstorm.svg via Iconify.
// ---------------------------------------------------------------------------

export function GlyphThunderstorm({ size }: GlyphProps): ReactElement {
  const cloudPath =
    'M7.5 16q-2.275 0-3.887-1.612T2 10.5q0-2.075 1.375-3.625t3.4-1.825q.8-1.425 2.188-2.238T12 2q2.25 0 3.913 1.438t2.012 3.587q1.725.15 2.9 1.425T22 11.5q0 1.875-1.312 3.188T17.5 16z';
  // Two lightning bolts, gold (same as sun — judgment call to unify the palette)
  const boltPath =
    'm7.5 23l.9-2.5H6.5L7.75 17h2.5l-1.075 2.5h2.075L8.5 23zm6.75-1l.7-2H13l1.075-3h2.5l-.875 2h2.05l-2.5 3z';
  return (
    <Svg size={size}>
      <path fill="url(#greyGrad)" d={cloudPath} />
      <path fill="url(#goldGrad)" d={boltPath} />
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
  const d =
    'M12.1 22q-2.1 0-3.937-.8t-3.2-2.162t-2.163-3.2T2 11.9q0-3.65 2.325-6.437T10.25 2q-.45 2.475.275 4.838t2.5 4.137t4.138 2.5T22 13.75q-.65 3.6-3.45 5.925T12.1 22';
  return (
    <Svg size={size}>
      <path fill="url(#moonGrad)" d={d} />
    </Svg>
  );
}
