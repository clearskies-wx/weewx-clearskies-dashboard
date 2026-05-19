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
  Info,
  Scale,
  Ellipsis,
} from 'lucide-react';
import { ThemeToggle, ThemeIcon, NEXT_PREFERENCE, ARIA_LABEL } from './theme-toggle';
import { useTheme } from '../../lib/theme-provider';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

// All 9 navigation items in default order per ADR-024.
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Now', icon: <House aria-hidden="true" className="h-5 w-5" /> },
  { to: '/forecast', label: 'Forecast', icon: <CloudSunRain aria-hidden="true" className="h-5 w-5" /> },
  { to: '/charts', label: 'Charts', icon: <ChartLine aria-hidden="true" className="h-5 w-5" /> },
  { to: '/almanac', label: 'Almanac', icon: <Moon aria-hidden="true" className="h-5 w-5" /> },
  { to: '/earthquakes', label: 'Earthquakes', icon: <Activity aria-hidden="true" className="h-5 w-5" /> },
  { to: '/records', label: 'Records', icon: <Trophy aria-hidden="true" className="h-5 w-5" /> },
  { to: '/reports', label: 'Reports', icon: <FileText aria-hidden="true" className="h-5 w-5" /> },
  { to: '/about', label: 'About', icon: <Info aria-hidden="true" className="h-5 w-5" /> },
  { to: '/legal', label: 'Legal', icon: <Scale aria-hidden="true" className="h-5 w-5" /> },
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

const THEME_ROW_LABEL: Record<string, string> = {
  system: 'Auto',
  light: 'Light',
  dark: 'Dark',
};

// Full-width labeled theme toggle row for the More sheet.
function ThemeRowButton() {
  const { preference, setTheme } = useTheme();
  return (
    <button
      type="button"
      aria-label={ARIA_LABEL[preference]}
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
      <span>Theme: {THEME_ROW_LABEL[preference]}</span>
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
      {/* Backdrop — z-[35] sits between nav bar (z-30) and sheet (z-40) */}
      <div
        aria-hidden="true"
        className={[
          'fixed inset-0 z-[35] bg-black/40 transition-opacity duration-150',
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
        onClick={onClose}
      />

      {/* Bottom sheet — pointer-events-none when closed so underlying nav bar remains clickable */}
      <div
        ref={sheetRef}
        role={isOpen ? 'dialog' : undefined}
        aria-label="Additional navigation"
        aria-modal={isOpen ? 'true' : undefined}
        // inert removes all interactivity (keyboard, pointer, AT) when sheet is closed.
        // aria-hidden mirrors the state for older AT that may not support inert.
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={[
          'fixed bottom-0 left-0 right-0 z-40',
          'bg-background border-t border-border rounded-t-2xl',
          'pb-[env(safe-area-inset-bottom,0px)]',
          'transition-transform duration-150 ease-out',
          // Sheet sits above the bottom nav bar (56px + border).
          'mb-[calc(56px+1px)]',
          isOpen ? 'translate-y-0 pointer-events-auto' : 'translate-y-full pointer-events-none',
        ].join(' ')}
      >
        {/* Drag handle — decorative */}
        <div aria-hidden="true" className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <nav aria-label="Additional pages">
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
                    <span>{item.label}</span>
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
        aria-label="Main navigation"
        className="hidden md:flex md:flex-col md:w-16 md:min-h-screen md:border-r md:border-border md:bg-background md:pt-4 md:pb-4 md:gap-1 md:items-center md:overflow-y-auto"
      >
        <ul className="flex flex-col gap-1 w-full px-1" role="list">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={navLinkClass}
                title={item.label}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        {/* Theme toggle at bottom of desktop rail */}
        <div className="mt-auto px-1 w-full flex justify-center">
          <ThemeToggle />
        </div>
      </nav>

      {/* Mobile: bottom nav bar — 4 primary slots + More button */}
      <nav
        aria-label="Main navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background"
      >
        <ul
          className="flex flex-row items-stretch"
          role="list"
        >
          {MOBILE_VISIBLE_ITEMS.map((item) => (
            <li key={item.to} className="flex-1 min-w-0">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => mobileSlotClass(isActive)}
                title={item.label}
              >
                {item.icon}
                <span className="truncate max-w-full leading-none">{item.label}</span>
              </NavLink>
            </li>
          ))}

          {/* More slot — 5th and final mobile slot */}
          <li className="flex-1 min-w-0">
            <button
              ref={moreButtonRef}
              type="button"
              aria-label="More pages"
              aria-expanded={sheetOpen}
              onClick={openSheet}
              className={mobileSlotClass(moreIsActive)}
            >
              <Ellipsis aria-hidden="true" className="h-5 w-5" />
              <span className="truncate max-w-full leading-none">More</span>
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
