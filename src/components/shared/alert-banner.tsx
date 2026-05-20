import { TriangleAlert } from 'lucide-react';
import type { AlertRecord } from '../../api/types';

interface AlertBannerProps {
  alerts: AlertRecord[];
}

// WCAG §5.4: aria-live level depends on severity.
// 'warning' (immediate danger) → assertive (interrupts screen reader immediately).
// 'watch' and 'advisory' (informational) → polite (waits for current speech to finish).
// role="status" gives polite semantics; role="alert" gives assertive.
function liveProps(severity: AlertRecord['severity']) {
  if (severity === 'warning') {
    return { role: 'alert' as const };
  }
  return { role: 'status' as const, 'aria-live': 'polite' as const };
}

export function AlertBanner({ alerts }: AlertBannerProps) {
  if (alerts.length === 0) return null;

  const primary = alerts[0];
  const live = liveProps(primary.severity);

  return (
    <div
      {...live}
      className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <TriangleAlert
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
      />
      <div>
        <p className="font-semibold leading-snug">{primary.event}</p>
        <p className="mt-0.5 text-sm leading-snug">{primary.headline}</p>
      </div>
    </div>
  );
}
