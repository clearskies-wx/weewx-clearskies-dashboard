// scene-background-types.ts — Asset map, types, and helpers for the ADR-047
// background system.  Separated from the React component file so that
// react-refresh/only-export-components is satisfied (the .tsx file contains
// only React components).

import type { SceneDescriptor } from '../../api/types';

// ---------------------------------------------------------------------------
// Asset imports (Vite handles hashing + bundling)
// ---------------------------------------------------------------------------

import sceneClearDay    from '../../assets/backgrounds/scene-clear-day.webp';
import sceneClearNight  from '../../assets/backgrounds/scene-clear-night.webp';
import sceneCloudyDay   from '../../assets/backgrounds/scene-cloudy-day.webp';
import sceneCloudyNight from '../../assets/backgrounds/scene-cloudy-night.webp';
import sceneStormDay    from '../../assets/backgrounds/scene-storm-day.webp';
import sceneStormNight  from '../../assets/backgrounds/scene-storm-night.webp';
import overlayRain      from '../../assets/backgrounds/overlay-rain.webp';
import overlaySnow      from '../../assets/backgrounds/overlay-snow.webp';

// ---------------------------------------------------------------------------
// Asset + attribution map
// ---------------------------------------------------------------------------

/**
 * Maps a sky × daytime key to a scene photo URL and optional attribution text.
 * Keys match SceneDescriptor.sky values ("clear" | "cloudy" | "storm")
 * combined with the daytime boolean ("day" | "night").
 *
 * Attribution strings come from ADR-047 §Decision 7 / implementation-notes table.
 * The clear-day photo (sky.jpg) and both overlays carry no credit.
 */
export interface SceneAssetEntry {
  /** Resolved URL for the scene background image. */
  url: string;
  /** Photographer credit to display, or null when no attribution is required. */
  attribution: string | null;
}

/** sky × daytime key → asset entry */
export const SCENE_ASSET_MAP: Readonly<Record<string, SceneAssetEntry>> = {
  'clear-day':    { url: sceneClearDay,    attribution: null },
  'clear-night':  { url: sceneClearNight,  attribution: 'Nathan Anderson' },
  'cloudy-day':   { url: sceneCloudyDay,   attribution: 'Davies Design Studio' },
  'cloudy-night': { url: sceneCloudyNight, attribution: 'Ben Mathis-Seibel' },
  'storm-day':    { url: sceneStormDay,    attribution: 'Raychel Sanner' },
  'storm-night':  { url: sceneStormNight,  attribution: 'Felix Mittermeier' },
} as const;

/**
 * Overlay map: overlay key → { url, blendMode }.
 * rain = "overlay" blend (flat-field photo; keeps mid-gray field neutral, lets drops read).
 * snow = "screen" blend (transparent frost cutout).
 * Per ADR-047 §Decision 1.
 */
export const OVERLAY_MAP: Readonly<Record<string, { url: string; blendMode: string }>> = {
  rain: { url: overlayRain, blendMode: 'overlay' },
  snow: { url: overlaySnow, blendMode: 'screen' },
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive the scene asset map key from a SceneDescriptor. */
export function sceneKey(scene: SceneDescriptor): string {
  return `${scene.sky}-${scene.daytime ? 'day' : 'night'}`;
}

/** Overlay opacity: 0.75 day / 0.25 night (ADR-047 §Decision 1 locked values). */
export function overlayOpacity(daytime: boolean): number {
  return daytime ? 0.75 : 0.25;
}
