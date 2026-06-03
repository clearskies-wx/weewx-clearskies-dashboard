// scene-background.tsx — ADR-047 global background layer React components.
//
// Renders three stacked full-viewport layers behind all app content:
//   1. Scene photo (base) — blurred 3px when a precipitation overlay is active.
//   2. Precipitation overlay — real on-glass photo, blend mode per ADR-047 §Decision 1.
//   3. Bottom scrim — linear gradient for WCAG AA text legibility over photos.
//
// This file exports ONLY React components (satisfies react-refresh/only-export-components).
// Asset map, types, and helper functions live in scene-background-types.ts.
//
// Mount once in AppLayout; pass `scene` from useObservation() (REST polling).
// No weather logic runs here — scene is a server-side computed descriptor
// consumed as-is (ADR-047 §Decision 6).
//
// Accessibility:
//   - Background layers are presentational (aria-hidden="true").
//   - No interactive elements in this file.

import type { CSSProperties } from 'react';
import type { SceneDescriptor } from '../../api/types';
import {
  SCENE_ASSET_MAP,
  OVERLAY_MAP,
  sceneKey,
  overlayOpacity,
} from './scene-background-types';

// ---------------------------------------------------------------------------
// SceneBackground
// ---------------------------------------------------------------------------

interface SceneBackgroundProps {
  /** Scene descriptor from the realtime service (useObservation / useRealtimeObservation). */
  scene: SceneDescriptor;
}

/**
 * SceneBackground — full-viewport decorative background layer.
 *
 * Mount once in AppLayout, behind all app content.  Pass the `scene` prop
 * reactively from useObservation.
 *
 * Renders three absolutely-positioned layers:
 *   1. Scene photo base (blurred 3px when overlay is active)
 *   2. Precipitation overlay (real on-glass photo, per-overlay blend mode)
 *   3. Bottom scrim (legibility gradient, always present)
 *
 * All layers are presentational / aria-hidden — no content for AT.
 */
export function SceneBackground({ scene }: SceneBackgroundProps) {
  const key = sceneKey(scene);
  const asset = SCENE_ASSET_MAP[key] ?? SCENE_ASSET_MAP['clear-day'];
  const overlayConfig = scene.overlay !== null ? OVERLAY_MAP[scene.overlay] : null;
  const hasOverlay = overlayConfig !== null;

  // 3px base blur only when a precipitation overlay is active (ADR-047 §Decision 1).
  const baseFilter = hasOverlay
    ? 'blur(3px) brightness(0.93) saturate(1.05)'
    : 'brightness(1) saturate(1.05)';

  return (
    // Outer container: fixed, full-viewport, behind all content (z-index -1).
    // aria-hidden="true" + role="presentation": purely decorative.
    // (WCAG 1.1.1 / coding.md §5.5 decorative image rule)
    <div
      aria-hidden="true"
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        backgroundColor: '#000',
        overflow: 'hidden',
      }}
    >
      {/* Layer 1: scene photo base.
          Slightly over-scaled (inset: -40px + scale 1.05) so blur doesn't
          leave dark edges.  background-size: cover + center for all ratios. */}
      <div
        style={{
          position: 'absolute',
          inset: '-40px',
          backgroundImage: `url(${asset.url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: baseFilter,
          transform: 'scale(1.05)',
          transformOrigin: 'center',
          willChange: 'filter',
        }}
      />

      {/* Layer 2: precipitation overlay (real on-glass photo).
          Rendered only when scene.overlay is non-null.
          Opacity: 0.75 day / 0.25 night (ADR-047 §Decision 1 locked values). */}
      {hasOverlay && overlayConfig !== null && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${overlayConfig.url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: overlayOpacity(scene.daytime),
            // Cast: CSSProperties['mixBlendMode'] is a broad string union; the
            // ADR-047 locked values ("overlay" | "screen") are valid CSS spec values.
            mixBlendMode: overlayConfig.blendMode as CSSProperties['mixBlendMode'],
          }}
        />
      )}

      {/* Layer 3: bottom scrim — legibility gradient.
          transparent 60% → rgba(0,0,0,0.32) 100%.
          Always present; this is the WCAG AA contrast mechanism for text
          near the bottom of the viewport over busy photos.
          (ADR-026 / ADR-047 §Decision + implementation notes) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.32) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

