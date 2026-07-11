// ActivityAccordion.tsx — Mobile (<768px) accordion container for Marine
// Activities. WAI-ARIA accordion pattern: each header is a <button> with
// aria-expanded/aria-controls; multiple sections may be open at once (not
// mutually exclusive) so a visitor can compare activities side by side while
// scrolling. Same expand/collapse transition as CollapsibleCard (legal.tsx):
// 300ms ease-in-out max-height (DESIGN-MANUAL §14).

import { useState } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import type { ActivityDef } from './activity-types';

interface ActivityAccordionProps {
  activities: ActivityDef[];
}

export function ActivityAccordion({ activities }: ActivityAccordionProps) {
  // First section open by default so a visitor sees content immediately.
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(activities[0] ? [activities[0].id] : []),
  );

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (activities.length === 0) return null;

  return (
    <div className="flex flex-col divide-y divide-border border-t border-b border-border">
      {activities.map((activity) => {
        const isOpen = openIds.has(activity.id);
        return (
          <div key={activity.id}>
            <h3 className="m-0">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`marine-accordion-panel-${activity.id}`}
                id={`marine-accordion-header-${activity.id}`}
                onClick={() => toggle(activity.id)}
                className={[
                  'flex items-center justify-between w-full gap-2 px-1 py-3',
                  'min-h-[44px] text-left font-semibold bg-transparent border-none cursor-pointer',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded',
                ].join(' ')}
                style={{ fontSize: 'var(--text-body)' }}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {activity.icon}
                  <span className="truncate">{activity.label}</span>
                  {activity.qualitativeLabel && (
                    <span className="text-muted-foreground shrink-0" style={{ fontSize: 'var(--text-micro)' }}>
                      {activity.qualitativeLabel}
                    </span>
                  )}
                </span>
                <CaretDown
                  aria-hidden="true"
                  focusable="false"
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-200"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>
            </h3>
            <div
              id={`marine-accordion-panel-${activity.id}`}
              role="region"
              aria-labelledby={`marine-accordion-header-${activity.id}`}
              className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
              style={{ maxHeight: isOpen ? '10000px' : '0' }}
            >
              <div className="pb-4 px-1">{activity.content}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
