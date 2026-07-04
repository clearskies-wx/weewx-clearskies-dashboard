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
import { useTranslation } from 'react-i18next';
import { SkipLink } from './skip-link';
import { NavRail } from './nav-rail';
import { Footer } from './footer';
import { useObservation, useAlerts, useStation } from '../../hooks/useWeatherData';
import { useTheme } from '../../lib/theme-provider';
import { SceneBackground } from '../background/scene-background';
import { AlertBanner } from '../shared/alert-banner';
import { CookieConsentBanner } from '../shared/cookie-consent-banner';
import { trackPageView } from '../../lib/analytics';
import { dismissSplash } from '../../lib/dismiss-splash';
import { SUPPORTED_LOCALES } from '../../i18n';
import type { SceneDescriptor } from '../../api/types';

export function AppLayout() {
  const { scene, sceneLoaded } = useObservation();
  const { data: alerts, loading: alertLoading } = useAlerts();
  const { data: station } = useStation();
  const { preference, setDaytime, cacheScene } = useTheme();
  const { i18n } = useTranslation();
  const location = useLocation();

  // /radar renders a full-viewport `role="dialog" aria-modal="true"` overlay
  // as a child route of AppLayout (Phase 5 T5.1). The overlay visually covers
  // NavRail/Footer/AlertBanner/SkipLink via z-index, but z-index stacking does
  // not remove them from the keyboard tab order or the accessibility tree —
  // without this, a keyboard or screen-reader user could reach navigation
  // "behind" the open dialog. Mark those regions inert + aria-hidden while
  // radar is open instead.
  const isRadarOpen = location.pathname === '/radar';

  useEffect(() => {
    if (sceneLoaded) {
      setDaytime(scene.daytime);
      cacheScene({ daytime: scene.daytime, sky: scene.sky, overlay: scene.overlay });
      dismissSplash();
    }
  }, [scene.daytime, scene.sky, scene.overlay, sceneLoaded, setDaytime, cacheScene]);

  // T2.6 / DASHBOARD-MANUAL §3: the dashboard does not detect the visitor's
  // browser locale. It starts at the safe default 'en' (src/i18n/index.ts)
  // and switches to the operator's configured StationMetadata.defaultLocale
  // once station data loads. Validated against SUPPORTED_LOCALES since the
  // value originates from operator config on the API side (trust boundary).
  useEffect(() => {
    const defaultLocale = station?.defaultLocale;
    if (
      defaultLocale &&
      (SUPPORTED_LOCALES as readonly string[]).includes(defaultLocale) &&
      defaultLocale !== i18n.language
    ) {
      void i18n.changeLanguage(defaultLocale);
    }
  }, [station?.defaultLocale, i18n]);

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
      <NavRail hidden={isRadarOpen} />

      <div className="h-[100dvh] flex flex-col text-foreground overflow-hidden relative z-0">
        <SkipLink hidden={isRadarOpen} />

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
                <div
                  className="mb-4"
                  aria-hidden={isRadarOpen}
                  inert={isRadarOpen ? true : undefined}
                >
                  <AlertBanner alerts={alerts} stationTz={station?.timezone ?? 'UTC'} />
                </div>
              )}
              <Outlet />
            </main>

            <Footer hidden={isRadarOpen} />
          </div>
        </div>
      </div>
    </>
  );
}
