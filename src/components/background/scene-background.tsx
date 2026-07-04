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

import { type CSSProperties, useContext, useEffect, useRef, useState } from 'react';
import type { SceneDescriptor } from '../../api/types';
import { BrandingContext } from '../../lib/branding-provider';
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
  // Read via useContext (not the throwing useBranding() hook) so this component
  // stays usable standalone (e.g. tests, Storybook) without a BrandingProvider
  // ancestor — same pattern ThemeProvider uses for defaultThemeMode.
  const branding = useContext(BrandingContext);
  // Empty string counts as "not set" — only a non-empty string opts into the
  // custom-background path (BrandingConfig.customBackgroundUrl).
  const rawCustomBg = branding?.customBackgroundUrl;
  const customBg = rawCustomBg && rawCustomBg.trim().length > 0 ? rawCustomBg : null;

  const key = sceneKey(scene);
  const asset = SCENE_ASSET_MAP[key] ?? SCENE_ASSET_MAP['clear-day'];

  // An operator's custom background (set via the setup wizard, written to
  // branding.json) replaces the scene-keyed photo for every sky condition —
  // the 6 built-in scene lookups are bypassed entirely. Custom backgrounds are
  // static: no precipitation overlay (the on-glass rain/snow assets are designed
  // for the built-in photos, not arbitrary operator images) and no photographer
  // attribution (it's the operator's own image — DESIGN-MANUAL §8). If a future
  // consumer needs "what attribution applies to the current background," it must
  // check customBg first and treat it as null attribution — sceneAttribution()
  // in scene-background-types.ts only knows about the 6 built-in scenes.
  const bgUrl = customBg ?? asset.url;
  const overlayConfig = !customBg && scene.overlay !== null ? OVERLAY_MAP[scene.overlay] : null;
  const hasOverlay = overlayConfig !== null;

  // 3px base blur only when a precipitation overlay is active (ADR-047 §Decision 1).
  const baseFilter = hasOverlay
    ? 'blur(3px) brightness(0.93) saturate(1.05)'
    : 'brightness(1) saturate(1.05)';

  // Cross-fade: old background on top fading out reveals the new one underneath.
  // Bottom layer: current background at full opacity (always visible).
  // Top layer: outgoing (old) background, starts at opacity 1, fades to 0, then removed.
  // Keyed on the resolved image URL (not the raw scene key) so a constant custom
  // background never re-triggers a fade when the underlying scene changes underneath
  // it, while scene-to-scene changes still cross-fade normally when no custom
  // background is set.
  const prevUrlRef = useRef(bgUrl);
  const [outgoingUrl, setOutgoingUrl] = useState<string | null>(null);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (bgUrl !== prevUrlRef.current) {
      const oldUrl = prevUrlRef.current;
      setOutgoingUrl(oldUrl);
      setFadeOut(false);
      prevUrlRef.current = bgUrl;

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
  }, [bgUrl]);

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
        {/* Bottom layer: current background, always full opacity */}
        <div
          style={{
            ...photoStyle,
            backgroundImage: `url(${bgUrl})`,
          }}
        />

        {/* Top layer: outgoing background, fades from opacity 1 → 0 then unmounted */}
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

