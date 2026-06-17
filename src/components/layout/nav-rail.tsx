// nav-rail.tsx — icon-rail navigation
// Desktop (≥768px): floating auto-hide panel with grab bar and pin toggle, vertically centered.
// Mobile (<768px): bottom nav bar — 4 primary slots + "More" button (5 total, per ADR-024).
// "More" opens a bottom sheet listing the 5 overflow pages.
// Active page: bg shift + accent-colored border per ADR-009/ADR-024.

import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  House,
  ChartLine,
  Trophy,
  FileText,
  Info,
  Scales,       // ADR-050: ph:scales — legal nav (Lucide Scale → Phosphor Scales)
  DotsThree,    // ADR-050: ph:dots-three — "more" menu (Lucide Ellipsis → Phosphor DotsThree)
  CloudSun,     // ADR-050: not enumerated; nearest Phosphor match for weather/Now nav (Lucide CloudSunRain → CloudSun)
  PushPin,
  PushPinSlash,
} from '@phosphor-icons/react';
// TODO(ADR-050 deferred: astro/almanac) — Moon stays on Lucide until C5 lands.
// TODO(ADR-050 deferred: seismic) — Activity stays on Lucide until seismic ADR lands.
import { Moon, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ThemeIcon, NEXT_PREFERENCE } from './theme-toggle';
import { useTheme } from '../../lib/theme-provider';

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
  { to: '/forecast', pageKey: 'forecast', icon: <CloudSun aria-hidden="true" className="h-5 w-5" /> },
  { to: '/charts', pageKey: 'charts', icon: <ChartLine aria-hidden="true" className="h-5 w-5" /> },
  { to: '/almanac', pageKey: 'almanac', icon: <Moon aria-hidden="true" className="h-5 w-5" /> /* TODO(ADR-050 deferred: astro/almanac) — C5 */ },
  { to: '/seismic', pageKey: 'seismic', icon: <Activity aria-hidden="true" className="h-5 w-5" /> /* TODO(ADR-050 deferred: seismic) — seismic ADR */ },
  { to: '/records', pageKey: 'records', icon: <Trophy aria-hidden="true" className="h-5 w-5" /> },
  { to: '/reports', pageKey: 'reports', icon: <FileText aria-hidden="true" className="h-5 w-5" /> },
  { to: '/about', pageKey: 'about', icon: <Info aria-hidden="true" className="h-5 w-5" /> },
  { to: '/legal', pageKey: 'legal', icon: <Scales aria-hidden="true" className="h-5 w-5" /> },
];

// Mobile: first 4 slots are always visible; remaining 5 go into the overflow sheet.
const MOBILE_VISIBLE_ITEMS = NAV_ITEMS.slice(0, 4);
const MOBILE_OVERFLOW_ITEMS = NAV_ITEMS.slice(4);

const OVERFLOW_ROUTES = new Set(MOBILE_OVERFLOW_ITEMS.map((item) => item.to));

// NavLink className helper — active state: bg shift + left border (desktop) / top border (mobile).
function navLinkClass({ isActive }: { isActive: boolean }): string {
  const base = [
    'flex items-center gap-2 rounded-md px-3 py-2 font-semibold',
    'transition-colors duration-150',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    // Desktop: flex-col to stack icon above label, tight padding
    'md:flex-col md:gap-0.5 md:px-1 md:py-2 md:rounded-lg',
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
    'font-semibold transition-colors duration-150',
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
        'font-semibold transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'min-h-[56px]',
        'text-foreground hover:bg-accent/50',
      ].join(' ')}
      style={{ fontSize: 'var(--text-label)' }}
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
        'font-semibold transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'min-h-[44px]',
        'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      ].join(' ')}
      style={{ fontSize: 'var(--text-label)' }}
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
                      'font-semibold transition-colors duration-150',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      // Touch target: min 44px height per WCAG 2.5.5
                      'min-h-[56px]',
                      isActive
                        ? 'text-primary font-semibold bg-accent/40'
                        : 'text-foreground hover:bg-accent/50',
                    ].join(' ')}
                    style={{ fontSize: 'var(--text-label)' }}
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

// ── Desktop nav rail auto-hide constants ──────────────────────────────────────
const LS_KEY = 'clearskies.nav.pinned';
const AUTO_HIDE_MS = 4_000;

export function NavRail() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const { t } = useTranslation('nav');

  // ── Desktop auto-hide state ──────────────────────────────────────────────
  // Read initial pinned state from localStorage on mount.
  const [pinned, setPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [visible, setVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const startHideTimer = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
    }, AUTO_HIDE_MS);
  }, [clearHideTimer]);

  // On mount: if pinned, stay visible. If not pinned, start auto-hide timer.
  useEffect(() => {
    if (!pinned) {
      startHideTimer();
    }
    return () => clearHideTimer();
    // Only run on mount — intentionally no dependency on pinned here.
    // The pin-toggle handler manages timer state after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup timer on unmount.
  useEffect(() => {
    return () => clearHideTimer();
  }, [clearHideTimer]);

  function handleRailMouseEnter() {
    clearHideTimer();
    setVisible(true);
  }

  function handleRailMouseLeave() {
    if (!pinned) {
      startHideTimer();
    }
  }

  function handleGrabBarActivate() {
    clearHideTimer();
    setVisible(true);
  }

  function togglePin() {
    const next = !pinned;
    setPinned(next);
    try {
      localStorage.setItem(LS_KEY, String(next));
    } catch {
      // localStorage unavailable — continue without persistence.
    }
    if (next) {
      // Now pinned: clear any pending hide timer.
      clearHideTimer();
      setVisible(true);
    } else {
      // Now unpinned: start auto-hide timer.
      startHideTimer();
    }
  }

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
      {/* ── Desktop: grab handle — always visible at left edge.
          Collapsed: right-pointing chevron ("pull to open").
          Expanded: left-pointing chevron ("click to close").
          Positioned just right of the rail panel when open. */}
      <button
        type="button"
        aria-label={visible ? t('hideNav') : t('showNav')}
        aria-expanded={visible}
        onMouseEnter={!visible ? handleGrabBarActivate : undefined}
        onClick={visible ? () => { setPinned(false); try { localStorage.setItem(LS_KEY, 'false'); } catch {} setVisible(false); } : handleGrabBarActivate}
        className={[
          'hidden md:flex md:items-center md:justify-center',
          'fixed top-1/2 -translate-y-1/2 z-20',
          'w-5 h-14 rounded-r-lg',
          'card-glass shadow-md ring-1 ring-foreground/10',
          'cursor-pointer',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'border-0 p-0',
        ].join(' ')}
        style={{
          left: 0,
          transition: 'left 200ms ease',
        }}
        ref={(el) => {
          if (!el) return;
          if (visible) {
            const rail = el.nextElementSibling as HTMLElement | null;
            if (rail) {
              const w = rail.getBoundingClientRect().width;
              el.style.left = `${w}px`;
            }
          } else {
            el.style.left = '0px';
          }
        }}
      >
        <svg
          width="10"
          height="14"
          viewBox="0 0 10 14"
          fill="none"
          aria-hidden="true"
          style={{
            transform: visible ? 'rotate(180deg)' : 'none',
            transition: 'transform 200ms ease',
            opacity: 0.6,
          }}
        >
          <path d="M2 1L8 7L2 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* ── Desktop: floating rail panel ────────────────────────────────────
          Floats at left:12px, vertically centered via top:50%+translateY(-50%).
          Glass background, rounded, shadow. Slides in/out on visible change.
          Desktop-only (hidden on mobile). */}
      <nav
        aria-label={t('ariaMain')}
        // inert removes all children from the tab order and AT tree when rail is hidden.
        // aria-hidden mirrors the state for AT that may not fully support inert.
        // Pattern mirrors the MoreSheet inert={!isOpen} usage in this file.
        // inert={false} is omitted (undefined) so the attribute is absent from the DOM
        // when the rail is visible — browsers treat absent inert as interactive.
        inert={!visible ? true : undefined}
        aria-hidden={!visible}
        onMouseEnter={handleRailMouseEnter}
        onMouseLeave={handleRailMouseLeave}
        className={[
          // Desktop only
          'hidden md:flex md:flex-col',
          // Fixed, floating, vertically centered
          'fixed z-20',
          // Glass card styling — flush left edge, rounded right side only
          'card-glass shadow-lg ring-1 ring-foreground/10 rounded-r-xl',
          // Internal padding — tight to minimize overlap with content
          'py-2 px-1',
        ].join(' ')}
        style={{
          left: 0,
          top: '50%',
          transform: visible
            ? 'translateX(0) translateY(-50%)'
            : 'translateX(-100%) translateY(-50%)',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          // Slide + fade transition per spec (200ms ease).
          // translateY(-50%) must be combined with the horizontal slide, so the
          // full transform string lives in inline style — Tailwind cannot compose
          // multiple transform values alongside inline overrides safely.
          transition: 'opacity 200ms ease, transform 200ms ease',
        }}
      >
        {/* Pin toggle — top of rail, above nav items */}
        <div className="w-full pb-0.5">
          <button
            type="button"
            aria-label={pinned ? t('unpinNav') : t('pinNav')}
            onClick={togglePin}
            className={[
              'flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 w-full',
              'font-semibold transition-colors duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'min-h-[44px]',
              pinned
                ? 'text-primary hover:bg-accent/50'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            ].join(' ')}
            style={{ fontSize: 'var(--text-label)' }}
          >
            {pinned
              ? <PushPin aria-hidden="true" className="h-5 w-5" weight="fill" />
              : <PushPinSlash aria-hidden="true" className="h-5 w-5" />
            }
          </button>
        </div>

        {/* Nav items */}
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
                  style={{ fontSize: 'var(--text-label)' }}
                >
                  {item.icon}
                  <span className="truncate">{label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>

        {/* Theme toggle at bottom of desktop rail */}
        <div className="mt-1 w-full px-1">
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
                  style={{ fontSize: 'var(--text-label)' }}
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
              style={{ fontSize: 'var(--text-label)' }}
            >
              <DotsThree aria-hidden="true" className="h-5 w-5" />
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
