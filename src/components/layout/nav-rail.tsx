// nav-rail.tsx — icon-rail navigation
// Desktop (≥768px): left rail, vertical stack, ~64px wide. All 9 items always visible.
// Mobile (<768px): bottom nav bar — 4 primary slots + "More" button (5 total, per ADR-024).
// "More" opens a bottom sheet listing the 5 overflow pages.
// Active page: bg shift + accent-colored border per ADR-009/ADR-024.

import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  House,
  CloudSunRain,
  ChartLine,
  Moon,
  Activity,
  Trophy,
  FileText,
  Camera,
  Info,
  Scale,
  Ellipsis,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ThemeIcon, NEXT_PREFERENCE } from './theme-toggle';
import { useTheme } from '../../lib/theme-provider';
import { useBranding } from '../../lib/branding-provider';

interface NavItemDef {
  to: string;
  /** i18n key within nav.pages — e.g. "now", "forecast" */
  pageKey: string;
  icon: React.ReactNode;
}

// All 9 navigation items in default order per ADR-024.
// Labels are resolved via t(`pages.${pageKey}`) inside the component.
const NAV_ITEMS: NavItemDef[] = [
  { to: '/', pageKey: 'now', icon: <House aria-hidden="true" className="h-5 w-5" /> },
  { to: '/forecast', pageKey: 'forecast', icon: <CloudSunRain aria-hidden="true" className="h-5 w-5" /> },
  { to: '/charts', pageKey: 'charts', icon: <ChartLine aria-hidden="true" className="h-5 w-5" /> },
  { to: '/almanac', pageKey: 'almanac', icon: <Moon aria-hidden="true" className="h-5 w-5" /> },
  { to: '/earthquakes', pageKey: 'earthquakes', icon: <Activity aria-hidden="true" className="h-5 w-5" /> },
  { to: '/records', pageKey: 'records', icon: <Trophy aria-hidden="true" className="h-5 w-5" /> },
  { to: '/reports', pageKey: 'reports', icon: <FileText aria-hidden="true" className="h-5 w-5" /> },
  { to: '/webcam', pageKey: 'webcam', icon: <Camera aria-hidden="true" className="h-5 w-5" /> },
  { to: '/about', pageKey: 'about', icon: <Info aria-hidden="true" className="h-5 w-5" /> },
  { to: '/legal', pageKey: 'legal', icon: <Scale aria-hidden="true" className="h-5 w-5" /> },
];

// Mobile: first 4 slots are always visible; remaining 5 go into the overflow sheet.
const MOBILE_VISIBLE_ITEMS = NAV_ITEMS.slice(0, 4);
const MOBILE_OVERFLOW_ITEMS = NAV_ITEMS.slice(4);

const OVERFLOW_ROUTES = new Set(MOBILE_OVERFLOW_ITEMS.map((item) => item.to));

// NavLink className helper — active state: bg shift + left border (desktop) / top border (mobile).
function navLinkClass({ isActive }: { isActive: boolean }): string {
  const base = [
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
    'transition-colors duration-150',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    // Desktop: flex-col to stack icon above label
    'md:flex-col md:gap-1 md:px-2 md:py-3 md:text-xs md:rounded-lg',
    // Touch target min 44×44px per WCAG 2.5.5
    'min-h-[44px] min-w-[44px] justify-center',
  ].join(' ');

  if (isActive) {
    return [
      base,
      'bg-accent text-accent-foreground',
      // Desktop: left accent border; Mobile: top accent border
      'border-l-2 border-primary md:border-l-2 md:border-t-0',
    ].join(' ');
  }
  return [
    base,
    'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
    'border-l-2 border-transparent md:border-l-2',
  ].join(' ');
}

// Shared bottom-nav slot class for both NavLink items and the More button.
function mobileSlotClass(isActive: boolean): string {
  return [
    'flex flex-col items-center justify-center gap-0.5 py-2 px-1',
    'text-xs font-medium transition-colors duration-150',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'min-h-[56px] w-full border-t-2',
    isActive
      ? 'text-primary border-primary bg-accent/30'
      : 'text-muted-foreground hover:text-foreground border-transparent',
  ].join(' ');
}

// Focusable elements selector for the focus trap inside the sheet.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// Full-width labeled theme toggle row for the More sheet.
function ThemeRowButton() {
  const { preference, setTheme } = useTheme();
  const { t } = useTranslation('nav');
  const modeLabel = t(`theme.${preference === 'system' ? 'auto' : preference}`);
  return (
    <button
      type="button"
      aria-label={t(`theme.aria${preference.charAt(0).toUpperCase()}${preference.slice(1)}`)}
      onClick={() => setTheme(NEXT_PREFERENCE[preference])}
      className={[
        'flex items-center gap-3 px-4 rounded-lg w-full',
        'text-sm font-medium transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'min-h-[56px]',
        'text-foreground hover:bg-accent/50',
      ].join(' ')}
    >
      <ThemeIcon preference={preference} />
      <span>{modeLabel}</span>
    </button>
  );
}

// Nav-item-styled theme toggle for the desktop rail.
// Matches icon + label stacked vertically so it reads as a first-class rail element,
// not an afterthought ghost button that disappears against the dark background.
function DesktopThemeButton() {
  const { preference, setTheme } = useTheme();
  const { t } = useTranslation('nav');
  return (
    <button
      type="button"
      aria-label={t(`theme.aria${preference.charAt(0).toUpperCase()}${preference.slice(1)}`)}
      onClick={() => setTheme(NEXT_PREFERENCE[preference])}
      className={[
        'flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-3 w-full',
        'text-xs font-medium transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'min-h-[44px]',
        'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      ].join(' ')}
    >
      <ThemeIcon preference={preference} />
      <span>{t('theme.label')}</span>
    </button>
  );
}

interface MoreSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** ref to the "More" button so focus returns there on close */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

function MoreSheet({ isOpen, onClose, triggerRef }: MoreSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { t } = useTranslation('nav');

  // Focus first focusable element when sheet opens (after slide-in transition starts).
  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      const first = sheet.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    });
  }, [isOpen]);

  // Escape key closes the sheet; focus trap constrains Tab within sheet.
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        triggerRef.current?.focus();
        return;
      }

      if (e.key === 'Tab') {
        const sheet = sheetRef.current;
        if (!sheet) return;
        const focusable = Array.from(
          sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => el.offsetParent !== null); // only visible elements
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          // Shift+Tab from first element wraps to last.
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab from last element wraps to first.
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, triggerRef]);

  // Close sheet when route changes (user tapped a link in the sheet).
  const prevLocation = useRef(location.pathname);
  useEffect(() => {
    if (prevLocation.current !== location.pathname) {
      prevLocation.current = location.pathname;
      if (isOpen) onClose();
    }
  }, [location.pathname, isOpen, onClose]);

  return (
    <>
      {/* Backdrop — z-[35] sits between nav bar (z-30) and sheet (z-40).
          md:hidden: MoreSheet is mobile-only; on desktop the backdrop must not appear. */}
      <div
        aria-hidden="true"
        className={[
          'md:hidden',
          'fixed inset-0 z-[35] bg-black/40 transition-opacity duration-150',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        onClick={onClose}
      />

      {/* Bottom sheet — pointer-events-none when closed so underlying nav bar remains clickable.
          md:hidden: MoreSheet is mobile-only; on desktop the fixed positioning with its
          mb-[calc(56px+1px)] offset caused ~57px of the sheet to peek above the viewport
          bottom even when translate-y-full was applied (the margin-bottom created visible
          space). Hiding on md+ prevents the desktop "Earthquakes artifact". */}
      <div
        ref={sheetRef}
        role={isOpen ? 'dialog' : undefined}
        aria-label={t('ariaAdditional')}
        aria-modal={isOpen ? 'true' : undefined}
        // inert removes all interactivity (keyboard, pointer, AT) when sheet is closed.
        // aria-hidden mirrors the state for older AT that may not support inert.
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={[
          'md:hidden',
          'fixed bottom-0 left-0 right-0 z-40',
          'bg-background border-t border-border rounded-t-2xl',
          'pb-[env(safe-area-inset-bottom,0px)]',
          'transition-transform duration-150 ease-out',
          // Sheet sits above the bottom nav bar (56px + border).
          'mb-[calc(56px+1px)]',
          isOpen ? 'translate-y-0 pointer-events-auto' : 'translate-y-[calc(100%+57px)] pointer-events-none',
        ].join(' ')}
      >
        {/* Drag handle — decorative */}
        <div aria-hidden="true" className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <nav aria-label={t('ariaAdditionalPages')}>
          <ul role="list" className="flex flex-col px-2 pb-1">
            {MOBILE_OVERFLOW_ITEMS.map((item) => {
              const isActive = location.pathname === item.to ||
                (item.to !== '/' && location.pathname.startsWith(item.to));
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={[
                      'flex items-center gap-3 px-4 rounded-lg',
                      'text-sm font-medium transition-colors duration-150',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      // Touch target: min 44px height per WCAG 2.5.5
                      'min-h-[56px]',
                      isActive
                        ? 'text-primary font-semibold bg-accent/40'
                        : 'text-foreground hover:bg-accent/50',
                    ].join(' ')}
                    onClick={onClose}
                  >
                    {item.icon}
                    <span>{t(`pages.${item.pageKey}`)}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Divider between nav links and settings controls */}
        <div aria-hidden="true" className="mx-4 border-t border-border" />

        {/* Theme control — cycles preference without closing the sheet */}
        <div className="px-2 pb-3 pt-1">
          <ThemeRowButton />
        </div>
      </div>
    </>
  );
}

export function NavRail() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const branding = useBranding();
  const { resolved } = useTheme();
  const { t } = useTranslation('nav');

  // "More" is active when the current route is one of the overflow pages.
  const moreIsActive = OVERFLOW_ROUTES.has(location.pathname);

  function openSheet() {
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
  }

  // Prevent body scroll when sheet is open.
  useEffect(() => {
    if (sheetOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sheetOpen]);

  return (
    <>
      {/* Desktop: left rail — all 9 items, unchanged */}
      <nav
        aria-label={t('ariaMain')}
        className="hidden md:flex md:flex-col md:w-16 md:min-h-screen md:border-r md:border-border md:bg-background md:pt-4 md:pb-4 md:gap-1 md:items-center md:overflow-y-auto"
      >
        {branding.logo && (
          <div className="mb-2 flex w-full justify-center px-2">
            <img
              src={
                resolved === 'dark' && branding.logo.dark
                  ? branding.logo.dark
                  : branding.logo.light
              }
              alt={branding.logo.alt}
              className={[
                'max-h-10 w-auto',
                // When in dark mode with only a light logo, invert so the logo
                // remains visible against the dark rail background (ADR-022).
                resolved === 'dark' && !branding.logo.dark ? 'invert' : '',
              ].join(' ').trim()}
            />
          </div>
        )}
        <ul className="flex flex-col gap-1 w-full px-1" role="list">
          {NAV_ITEMS.map((item) => {
            const label = t(`pages.${item.pageKey}`);
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={navLinkClass}
                  title={label}
                >
                  {item.icon}
                  <span className="truncate">{label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
        {/* Theme toggle at bottom of desktop rail — styled as a nav item so it
            is visually discoverable and matches the icon+label pattern of all nav items. */}
        <div className="mt-auto w-full px-1">
          <DesktopThemeButton />
        </div>
      </nav>

      {/* Mobile: bottom nav bar — 4 primary slots + More button.
          Uses aria-label="Primary navigation" (distinct from the desktop rail's
          "Main navigation") so screen readers don't report two landmarks with
          identical names. Both exist in the DOM simultaneously; only one is
          visible at a time via responsive Tailwind classes. */}
      <nav
        aria-label={t('ariaPrimary')}
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background"
      >
        <ul
          className="flex flex-row items-stretch"
          role="list"
        >
          {MOBILE_VISIBLE_ITEMS.map((item) => {
            const label = t(`pages.${item.pageKey}`);
            return (
              <li key={item.to} className="flex-1 min-w-0">
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => mobileSlotClass(isActive)}
                  title={label}
                >
                  {item.icon}
                  <span className="truncate max-w-full leading-none">{label}</span>
                </NavLink>
              </li>
            );
          })}

          {/* More slot — 5th and final mobile slot */}
          <li className="flex-1 min-w-0">
            <button
              ref={moreButtonRef}
              type="button"
              aria-label={t('morePages')}
              aria-expanded={sheetOpen}
              onClick={openSheet}
              className={mobileSlotClass(moreIsActive)}
            >
              <Ellipsis aria-hidden="true" className="h-5 w-5" />
              <span className="truncate max-w-full leading-none">{t('more')}</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* More sheet — rendered outside the nav so it can layer above it */}
      <MoreSheet
        isOpen={sheetOpen}
        onClose={closeSheet}
        triggerRef={moreButtonRef}
      />
    </>
  );
}
