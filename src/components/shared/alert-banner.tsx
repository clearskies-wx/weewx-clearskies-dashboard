import { TriangleAlert } from 'lucide-react';
import type { AlertRecord } from '../../mock/alerts';

interface AlertBannerProps {
  alerts: AlertRecord[];
}

export function AlertBanner({ alerts }: AlertBannerProps) {
  if (alerts.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <TriangleAlert
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
      />
      <div>
        <p className="font-semibold leading-snug">{alerts[0].event}</p>
        <p className="mt-0.5 text-sm leading-snug">{alerts[0].headline}</p>
      </div>
    </div>
  );
}
