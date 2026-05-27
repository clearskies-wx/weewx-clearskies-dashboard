// app-layout.tsx — top-level shell: skip-link + nav-rail + main + footer
// Outlet renders the active route's page component.

import { Outlet } from 'react-router-dom';
import { SkipLink } from './skip-link';
import { NavRail } from './nav-rail';
import { Footer } from './footer';

export function AppLayout() {
  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
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
  );
}
