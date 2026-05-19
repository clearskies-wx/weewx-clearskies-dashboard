// nav-rail.tsx — icon-rail navigation
// Desktop (≥768px): left rail, vertical stack, ~64px wide.
// Mobile (<768px): bottom nav bar, horizontal.
// Active page: bg shift + accent-colored border per ADR-009/ADR-024.

import { NavLink } from 'react-router-dom';
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
} from 'lucide-react';
import { ThemeToggle } from './theme-toggle';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

// Navigation items in default order per ADR-024.
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

// NavLink className helper — active state: bg shift + left border (desktop) / top border (mobile).
function navLinkClass({ isActive }: { isActive: boolean }): string {
  const base = [
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
    'transition-colors duration-150',
    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
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

export function NavRail() {
  return (
    <>
      {/* Desktop: left rail */}
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

      {/* Mobile: bottom nav bar */}
      <nav
        aria-label="Main navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background"
      >
        <ul
          className="flex flex-row items-stretch overflow-x-auto"
          role="list"
          style={{ scrollbarWidth: 'none' }}
        >
          {NAV_ITEMS.map((item) => (
            <li key={item.to} className="flex-1 min-w-0">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => [
                  'flex flex-col items-center justify-center gap-0.5 py-2 px-1',
                  'text-xs font-medium transition-colors duration-150',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                  'min-h-[56px] w-full',
                  isActive
                    ? 'text-primary border-t-2 border-primary bg-accent/30'
                    : 'text-muted-foreground hover:text-foreground border-t-2 border-transparent',
                ].join(' ')}
                title={item.label}
              >
                {item.icon}
                <span className="truncate max-w-full leading-none">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
