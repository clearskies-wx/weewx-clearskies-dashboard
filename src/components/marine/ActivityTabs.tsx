// ActivityTabs.tsx — Desktop (>=768px) tab container for Marine Activities.
// WAI-ARIA tabs pattern, same keyboard-navigation approach as the Charts
// page's config-driven group tabs (src/routes/charts.tsx) — Left/Right/Home/
// End move focus and activate the tab; roving tabIndex.

import { useCallback, useRef, useState } from 'react';
import type { ActivityDef } from './activity-types';

interface ActivityTabsProps {
  activities: ActivityDef[];
  /** aria-label for the tablist, e.g. "Marine activities for {location}". */
  ariaLabel: string;
}

export function ActivityTabs({ activities, ariaLabel }: ActivityTabsProps) {
  const [activeId, setActiveId] = useState<string | undefined>(activities[0]?.id);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number | null = null;
      if (e.key === 'ArrowRight') nextIndex = (index + 1) % activities.length;
      else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + activities.length) % activities.length;
      else if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = activities.length - 1;

      if (nextIndex !== null) {
        e.preventDefault();
        setActiveId(activities[nextIndex].id);
        tabRefs.current[nextIndex]?.focus();
      }
    },
    [activities],
  );

  if (activities.length === 0) return null;

  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex gap-1 flex-wrap border-b border-border pb-0"
      >
        {activities.map((activity, index) => {
          const isActive = activeId === activity.id;
          return (
            <button
              key={activity.id}
              ref={(el) => { tabRefs.current[index] = el; }}
              role="tab"
              id={`marine-tab-${activity.id}`}
              aria-selected={isActive}
              aria-controls={`marine-panel-${activity.id}`}
              tabIndex={isActive ? 0 : -1}
              type="button"
              onClick={() => setActiveId(activity.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={[
                'flex items-center gap-2 rounded-t-md px-4 py-2.5 font-semibold transition-colors',
                'min-h-[44px]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-muted/70',
              ].join(' ')}
              style={{ fontSize: 'var(--text-label)' }}
            >
              {activity.icon}
              <span>{activity.label}</span>
              {activity.qualitativeLabel && (
                <span
                  // DESIGN-MANUAL §4: never apply opacity modifiers to text
                  // color tokens. text-muted-foreground on the inactive tab's
                  // bg-muted fill also failed AA contrast (axe color-contrast,
                  // both are "muted" surfaces not designed to pair as
                  // text-on-fill) — text-foreground/text-primary-foreground
                  // match the tab label's own color and are the audited pairs
                  // for bg-muted/bg-primary respectively.
                  className={isActive ? 'text-primary-foreground' : 'text-foreground'}
                  style={{ fontSize: 'var(--text-micro)' }}
                >
                  {activity.qualitativeLabel}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activities.map((activity) => (
        <div
          key={activity.id}
          role="tabpanel"
          id={`marine-panel-${activity.id}`}
          aria-labelledby={`marine-tab-${activity.id}`}
          hidden={activeId !== activity.id}
          className="pt-4"
        >
          {activeId === activity.id && activity.content}
        </div>
      ))}
    </div>
  );
}
