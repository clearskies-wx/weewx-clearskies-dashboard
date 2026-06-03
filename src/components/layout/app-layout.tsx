// app-layout.tsx — top-level shell: skip-link + nav-rail + main + footer
// Outlet renders the active route's page component.
//
// Also mounts the ADR-047 global background layer (SceneBackground +
// SceneAttribution) behind all app content.  Scene data comes from
// useObservation() (REST polling) — the background does not need SSE
// sub-second reactivity; page-level components use useRealtimeObservation().

import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { SkipLink } from './skip-link';
import { NavRail } from './nav-rail';
import { Footer } from './footer';
import { useObservation } from '../../hooks/useWeatherData';
import { useTheme } from '../../lib/theme-provider';
import { SceneBackground, SceneAttribution } from '../background/scene-background';

export function AppLayout() {
  const { scene } = useObservation();
  const { setDaytime } = useTheme();

  useEffect(() => {
    setDaytime(scene.daytime);
  }, [scene.daytime, setDaytime]);

  return (
    <>
      {/* ADR-047 global background: fixed, z-index -1, behind all content.
          aria-hidden / role="presentation" are set inside the component. */}
      <SceneBackground scene={scene} />

      {/* Attribution pill — fixed bottom-right corner; renders null when no credit. */}
      <SceneAttribution scene={scene} />

      <div className="h-screen flex flex-col text-foreground overflow-hidden">
        {/* Skip link is the FIRST focusable element in the DOM per WCAG 2.4.1 */}
        <SkipLink />

        <div className="flex flex-1 min-h-0">
          {/* Left rail (desktop). NavRail also renders mobile bottom nav. */}
          <NavRail />

          {/* Content column */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0">
            {/* main-content target for skip link */}
            <main
              id="main-content"
              className={[
                'flex-1 min-h-0 overflow-y-auto px-4 py-6',
                // Bottom padding on mobile so content isn't hidden behind bottom nav
                'pb-24 md:pb-6',
              ].join(' ')}
              // tabIndex={-1} allows skip-link focus to land here without
              // making the element part of the normal tab order.
              tabIndex={-1}
            >
              <Outlet />
            </main>

            <Footer />
          </div>
        </div>
      </div>
    </>
  );
}
