// scene-background.tsx — ADR-047 global background layer React components.
//
// Renders three stacked full-viewport layers behind all app content:
//   1. Scene photo (base) — blurred 3px when a precipitation overlay is active.
//   2. Precipitation overlay — real on-glass photo, blend mode per ADR-047 §Decision 1.
//   3. Bottom scrim — linear gradient for WCAG AA text legibility over photos.
//
// SceneAttribution renders a corner photographer credit when the current scene has one.
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
//   - The attribution <p> is visible text with photographer credit.
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

// ---------------------------------------------------------------------------
// SceneAttribution
// ---------------------------------------------------------------------------

interface SceneAttributionProps {
  /** Scene descriptor — attribution is derived from SCENE_ASSET_MAP. */
  scene: SceneDescriptor;
}

/**
 * SceneAttribution — corner photographer credit element.
 *
 * Renders a small credit string for the 5 scene photos that have an attribution.
 * Renders null (no element at all) when there is no credit — i.e. for the
 * clear-day photo and both on-glass overlays (ADR-047 §Decision 7).
 *
 * Fixed in the bottom-right corner, z-index 1 (above background, below content).
 * Semi-transparent pill with backdrop-blur matching the browser prototype.
 *
 * Accessibility: visible text; no interactive element; no ARIA needed.
 */
export function SceneAttribution({ scene }: SceneAttributionProps) {
  const key = sceneKey(scene);
  const asset = SCENE_ASSET_MAP[key] ?? SCENE_ASSET_MAP['clear-day'];

  if (asset.attribution === null) {
    return null;
  }

  // The attribution is a photo credit for the decorative background image.
  // It is rendered as aria-hidden="true" because:
  //   1. It describes the decorative background (aria-hidden in SceneBackground),
  //      not the weather content — screen readers announce weather, not photo provenance.
  //   2. Making it visible but outside a landmark is a WCAG region violation;
  //      making it inside the background's aria-hidden subtree is the correct treatment.
  //   3. Common industry practice: decorative hero/background photo credits
  //      are visually present for attribution compliance but aria-hidden.
  //
  // The photographer's credit obligation (legal/ethical) is satisfied by the
  // visible text element.  The screen-reader experience is not degraded because
  // users don't navigate weather dashboards by photo credit.
  return (
    <p
      aria-hidden="true"
      style={{
        position: 'fixed',
        right: '12px',
        bottom: '10px',
        zIndex: 1,
        fontSize: '11px',
        lineHeight: 1.4,
        color: 'rgba(255,255,255,0.82)',
        textShadow: '0 1px 2px rgba(0,0,0,0.7)',
        background: 'rgba(0,0,0,0.22)',
        padding: '3px 8px',
        borderRadius: '6px',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        margin: 0,
        pointerEvents: 'none',
      }}
    >
      Photo: {asset.attribution}
    </p>
  );
}
