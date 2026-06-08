// app-layout.tsx — top-level shell: skip-link + nav-rail + main + footer
// Outlet renders the active route's page component.
//
// Also mounts the ADR-047 global background layer (SceneBackground) behind
// all app content.  Scene data comes from useObservation() (REST polling) —
// the background does not need SSE sub-second reactivity; page-level
// components use useRealtimeObservation().  Photo credit for the current
// scene is passed to Footer via the photoCredit prop.

import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { SkipLink } from './skip-link';
import { NavRail } from './nav-rail';
import { Footer } from './footer';
import { useObservation, useAlerts } from '../../hooks/useWeatherData';
import { useTheme } from '../../lib/theme-provider';
import { SceneBackground } from '../background/scene-background';
import { AlertBanner } from '../shared/alert-banner';
import type { SceneDescriptor } from '../../api/types';

export function AppLayout() {
  const { scene, sceneLoaded } = useObservation();
  const { data: alerts, loading: alertLoading } = useAlerts();
  const { preference, setDaytime } = useTheme();

  useEffect(() => {
    setDaytime(scene.daytime);
  }, [scene.daytime, setDaytime]);

  // When the user has forced a manual light/dark preference, honour it for the
  // background as well: light → always daytime photo, dark → always night photo,
  // auto → use the server-computed scene.daytime value.
  const bgDaytime = preference === 'light' ? true
                  : preference === 'dark'  ? false
                  : scene.daytime;

  const resolvedScene: SceneDescriptor = {
    sky: scene.sky,
    daytime: bgDaytime,
    overlay: scene.overlay,
  };

  return (
    <>
      {/* ADR-047 global background: fixed, z-index -1, behind all content.
          aria-hidden / role="presentation" are set inside the component.
          visible=false until the first /current response arrives to avoid a
          flash of the wrong (default) scene before real data loads. */}
      <SceneBackground scene={resolvedScene} visible={sceneLoaded} />

      {/* h-[100dvh]: dynamic viewport height adjusts when mobile browser
          URL bar hides/shows, preventing the bottom nav from clipping. */}
      <div className="h-[100dvh] flex flex-col text-foreground overflow-hidden">
        {/* Skip link is the FIRST focusable element in the DOM per WCAG 2.4.1 */}
        <SkipLink />

        {/* NavRail: desktop rail is position:fixed (overlays content).
            Mobile bottom nav is also rendered inside NavRail. */}
        <NavRail />

        <div className="flex flex-1 min-h-0">
          {/* Content column — full width on desktop since rail is fixed overlay.
              Mobile: this div scrolls so footer scrolls with page content
              (the mobile nav bar is already fixed at the bottom).
              Desktop: this div doesn't scroll; main scrolls independently and
              footer stays at the viewport bottom.
              overflow-x-hidden: prevents child tables with overflow-x-auto from
              causing horizontal viewport scroll.
              overscrollBehaviorY contain: stops rubber-band overscroll tearing. */}
          <div
            className="flex flex-col flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden md:overflow-hidden"
            style={{ overscrollBehaviorY: 'contain' }}
          >
            <main
              id="main-content"
              className={[
                'flex-1 px-4 py-6',
                // Mobile: bottom padding clears the fixed bottom nav bar
                'pb-24',
                // Desktop: main scrolls independently; min-h-0 allows flex shrinking
                'md:min-h-0 md:overflow-y-auto md:pb-6',
              ].join(' ')}
              tabIndex={-1}
            >
              {!alertLoading && alerts && alerts.length > 0 && (
                <div className="mb-4">
                  <AlertBanner alerts={alerts} />
                </div>
              )}
              <Outlet />
            </main>

            <Footer />
          </div>
        </div>
      </div>
    </>
  );
}
