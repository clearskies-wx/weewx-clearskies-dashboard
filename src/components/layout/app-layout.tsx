// app-layout.tsx — top-level shell: skip-link + nav-rail + main + footer
// Outlet renders the active route's page component.
//
// Also mounts the ADR-047 global background layer (SceneBackground) behind
// all app content.  Scene data comes from useObservation() (REST polling) —
// the background does not need SSE sub-second reactivity; page-level
// components use useRealtimeObservation().  Photo credit for the current
// scene is passed to Footer via the photoCredit prop.
//
// Cookie consent banner (T3.4) and GA page view tracking (T3.5) are also
// wired here:
//   - CookieConsentBanner self-manages visibility based on branding config +
//     localStorage; renders nothing when GA is not configured or consent is set.
//   - GA page_view events fire on every React Router location change,
//     gated on whether GA has been initialised (i.e. consent was given).

import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SkipLink } from './skip-link';
import { NavRail } from './nav-rail';
import { Footer } from './footer';
import { useObservation, useAlerts, useStation } from '../../hooks/useWeatherData';
import { useTheme } from '../../lib/theme-provider';
import { SceneBackground } from '../background/scene-background';
import { AlertBanner } from '../shared/alert-banner';
import { CookieConsentBanner } from '../shared/cookie-consent-banner';
import { trackPageView } from '../../lib/analytics';
import type { SceneDescriptor } from '../../api/types';

export function AppLayout() {
  const { scene, sceneLoaded } = useObservation();
  const { data: alerts, loading: alertLoading } = useAlerts();
  const { data: station } = useStation();
  const { preference, setDaytime } = useTheme();
  const location = useLocation();

  useEffect(() => {
    if (sceneLoaded) {
      setDaytime(scene.daytime);
    }
  }, [scene.daytime, sceneLoaded, setDaytime]);

  // GA page view tracking — fires on every route change.
  // trackPageView() is a no-op when GA has not been initialised (consent not given),
  // so this is safe to call unconditionally.
  useEffect(() => {
    trackPageView(location.pathname, document.title);
  }, [location.pathname]);

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

      {/* Cookie consent banner (T3.4) — self-manages visibility.
          Renders nothing when googleAnalyticsId is absent or consent is stored. */}
      <CookieConsentBanner />

      {/* h-[100dvh]: dynamic viewport height adjusts when mobile browser
          URL bar hides/shows, preventing the bottom nav from clipping. */}
      {/* NavRail OUTSIDE the overflow-hidden wrapper. All NavRail elements
          are position:fixed — they must not be descendants of overflow:hidden
          or mobile browsers clip/hide them. */}
      <NavRail />

      <div className="h-[100dvh] flex flex-col text-foreground overflow-hidden relative z-0">
        <SkipLink />

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
                  <AlertBanner alerts={alerts} stationTz={station?.timezone ?? 'UTC'} />
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
