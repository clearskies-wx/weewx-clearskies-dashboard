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

import { type CSSProperties, useEffect, useRef, useState } from 'react';
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
  /**
   * When false, the photo layers are faded out (opacity 0).  The dark navy base
   * colour is always visible so the app never flashes white before the first
   * /current response arrives.  Defaults to true.
   */
  visible?: boolean;
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
export function SceneBackground({ scene, visible = true }: SceneBackgroundProps) {
  const key = sceneKey(scene);
  const asset = SCENE_ASSET_MAP[key] ?? SCENE_ASSET_MAP['clear-day'];
  const overlayConfig = scene.overlay !== null ? OVERLAY_MAP[scene.overlay] : null;
  const hasOverlay = overlayConfig !== null;

  // 3px base blur only when a precipitation overlay is active (ADR-047 §Decision 1).
  const baseFilter = hasOverlay
    ? 'blur(3px) brightness(0.93) saturate(1.05)'
    : 'brightness(1) saturate(1.05)';

  // Cross-fade: old scene on top fading out reveals new scene underneath.
  // Bottom layer: current scene at full opacity (always visible).
  // Top layer: outgoing (old) scene, starts at opacity 1, fades to 0, then removed.
  // The new scene is hidden behind the old until the fade reveals it — no flash.
  const prevKeyRef = useRef(key);
  const [outgoingUrl, setOutgoingUrl] = useState<string | null>(null);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (key !== prevKeyRef.current) {
      const oldKey = prevKeyRef.current;
      const oldAsset = SCENE_ASSET_MAP[oldKey] ?? SCENE_ASSET_MAP['clear-day'];
      setOutgoingUrl(oldAsset.url);
      setFadeOut(false);
      prevKeyRef.current = key;

      // Start fade on next frame so the outgoing layer renders at opacity 1 first.
      const rAF = requestAnimationFrame(() => {
        setFadeOut(true);
      });

      // Remove outgoing layer after transition completes.
      const timer = setTimeout(() => {
        setOutgoingUrl(null);
        setFadeOut(false);
      }, 1400);

      return () => {
        cancelAnimationFrame(rAF);
        clearTimeout(timer);
      };
    }
  }, [key]);

  const photoStyle: CSSProperties = {
    position: 'absolute',
    inset: '-40px',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    filter: baseFilter,
    transform: 'scale(1.05)',
    transformOrigin: 'center',
  };

  return (
    <div
      aria-hidden="true"
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        backgroundColor: 'var(--background)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: visible ? 1 : 0,
        }}
      >
        {/* Bottom layer: current scene, always full opacity */}
        <div
          style={{
            ...photoStyle,
            backgroundImage: `url(${asset.url})`,
          }}
        />

        {/* Top layer: outgoing scene, fades from opacity 1 → 0 then unmounted */}
        {outgoingUrl !== null && (
          <div
            style={{
              ...photoStyle,
              backgroundImage: `url(${outgoingUrl})`,
              opacity: fadeOut ? 0 : 1,
              transition: fadeOut ? 'opacity 1.2s ease-in-out' : 'none',
            }}
          />
        )}

        {hasOverlay && overlayConfig !== null && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${overlayConfig.url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: overlayOpacity(scene.daytime),
              mixBlendMode: overlayConfig.blendMode as CSSProperties['mixBlendMode'],
              transition: 'opacity 1.2s ease-in-out',
            }}
          />
        )}

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
    </div>
  );
}

