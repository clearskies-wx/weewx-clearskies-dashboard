// marine.tsx — Marine Activities page (DASHBOARD-MANUAL §12).
//
// Single route at /marine. Location selection is client-side React state,
// NOT a URL param — the route never changes when a location is picked.
//
// Two page states:
//   Landing state (selectedId === null): full map + location card grid.
//   Selected state (selectedId set): hero map strip + activity tabs
//     (>=768px) / accordion (<768px) with placeholder tab content — the
//     real per-activity data ensembles land in T7.2-T7.5.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Waves, CaretLeft, Sailboat, FishSimple, PersonSimpleSwim, Warning } from '@phosphor-icons/react';
import { PageLayout } from '../components/layout/page-layout';
import { LocationMap } from '../components/marine/LocationMap';
import { LocationCard } from '../components/marine/LocationCard';
import { ActivityTabs } from '../components/marine/ActivityTabs';
import { ActivityAccordion } from '../components/marine/ActivityAccordion';
import { SurfingIcon } from '../components/marine/SurfingIcon';
import { BoatingTab } from '../components/marine/tabs/BoatingTab';
import { SurfingTab } from '../components/marine/tabs/SurfingTab';
import { BeachSafetyTab } from '../components/marine/tabs/BeachSafetyTab';
import { FishingTab } from '../components/marine/tabs/FishingTab';
import type { ActivityDef, ActivityId } from '../components/marine/activity-types';
import { useMarineLocations, useStation } from '../hooks/useWeatherData';
import type { MarineLocationSummary } from '../api/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTIVITY_ICON_SIZE = 'size-4';

const BEACH_SAFETY_KEYS = new Set(['safe', 'caution', 'dangerous']);

/** Resolves a beach-safety level string to a translated qualitative label.
 *  Falls back to the raw provider value when it doesn't match a known key
 *  (defensive — the exact enum isn't yet locked in the API contract). */
function beachSafetyLabel(level: string | null, t: (key: string) => string): string | undefined {
  if (!level) return undefined;
  const key = level.toLowerCase();
  return BEACH_SAFETY_KEYS.has(key) ? t(`qualitative.${key}`) : level;
}

function surfLabel(rating: number | null, t: (key: string, opts?: Record<string, unknown>) => string): string | undefined {
  if (rating === null) return undefined;
  return t('qualitative.stars', { count: Math.round(rating) });
}

// ---------------------------------------------------------------------------
// TileSkeleton / TileError — same pattern as seismic.tsx
// ---------------------------------------------------------------------------

function TileSkeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`} aria-hidden="true" />;
}

function TileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t: tc } = useTranslation('common');
  return (
    <div role="alert" className="flex flex-col gap-2 items-start" style={{ fontSize: 'var(--text-body)' }}>
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        style={{ fontSize: 'var(--text-label)' }}
      >
        {tc('retry')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MarinePage
// ---------------------------------------------------------------------------

export function MarinePage() {
  const { t, i18n } = useTranslation('marine');
  const locale = i18n.language;

  const { data: locations, units, loading, error, refetch } = useMarineLocations();
  const { data: station } = useStation();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedLocation = useMemo(
    () => (locations ?? []).find((l) => l.locationId === selectedId) ?? null,
    [locations, selectedId],
  );

  function buildActivities(location: MarineLocationSummary): ActivityDef[] {
    const API_TO_DASHBOARD: Record<string, ActivityId> = {
      marine: 'boating',
      surf: 'surfing',
      fishing: 'fishing',
      beach_safety: 'beachSafety',
    };
    const enabled = new Set<ActivityId>(
      location.activities.map((a) => API_TO_DASHBOARD[a] ?? (a as ActivityId)),
    );
    const defs: ActivityDef[] = [];

    if (enabled.has('boating')) {
      defs.push({
        id: 'boating',
        icon: <Sailboat aria-hidden="true" focusable="false" className={ACTIVITY_ICON_SIZE} />,
        label: t('activities.boating'),
        content: <BoatingTab locationId={location.locationId} alerts={location.activeAlerts ?? []} />,
      });
    }
    if (enabled.has('surfing')) {
      defs.push({
        id: 'surfing',
        icon: <SurfingIcon size={16} />,
        label: t('activities.surfing'),
        qualitativeLabel: surfLabel(location.surfRating, t),
        content: <SurfingTab locationId={location.locationId} alerts={location.activeAlerts ?? []} />,
      });
    }
    if (enabled.has('fishing')) {
      defs.push({
        id: 'fishing',
        icon: <FishSimple aria-hidden="true" focusable="false" className={ACTIVITY_ICON_SIZE} />,
        label: t('activities.fishing'),
        content: <FishingTab locationId={location.locationId} alerts={location.activeAlerts ?? []} />,
      });
    }
    if (enabled.has('beachSafety')) {
      defs.push({
        id: 'beachSafety',
        icon: <PersonSimpleSwim aria-hidden="true" focusable="false" className={ACTIVITY_ICON_SIZE} />,
        label: t('activities.beachSafety'),
        qualitativeLabel: beachSafetyLabel(location.beachSafetyLevel, t),
        content: <BeachSafetyTab locationId={location.locationId} />,
      });
    }
    return defs;
  }

  const fallbackCenter: [number, number] = station ? [station.latitude, station.longitude] : [0, 0];

  return (
    <PageLayout title={t('title')} icon={<Waves weight="duotone" />}>
      {loading && (
        <>
          <span className="sr-only" role="status">{t('title')}</span>
          <TileSkeleton className="col-span-1 md:col-span-2 lg:col-span-4 h-[400px]" />
        </>
      )}

      {!loading && error && (
        <div className="col-span-full">
          <TileError message={t('unableToLoad')} onRetry={refetch} />
        </div>
      )}

      {!loading && !error && locations !== null && locations.length === 0 && (
        <div className="col-span-1 md:col-span-2 lg:col-span-4">
          <p className="text-muted-foreground text-center py-8" style={{ fontSize: 'var(--text-body)' }}>
            {t('noLocations')}
          </p>
        </div>
      )}

      {!loading && !error && locations !== null && locations.length > 0 && selectedLocation === null && (
        <>
          {/* Landing state: full map + card grid */}
          <div className="col-span-1 md:col-span-2 lg:col-span-4 flex flex-col gap-[var(--gap-grid)]">
            <h2 className="sr-only">{t('map.ariaLabel')}</h2>

            <LocationMap
              locations={locations}
              selectedId={selectedId}
              onSelectLocation={setSelectedId}
              variant="full"
              fallbackCenter={fallbackCenter}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--gap-grid)]">
              {locations.map((loc) => (
                <LocationCard
                  key={loc.locationId}
                  location={loc}
                  units={units}
                  locale={locale}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {!loading && !error && selectedLocation !== null && locations !== null && (
        <>
          {/* Selected state: hero map strip + back button + activity tabs/accordion */}
          <div className="col-span-1 md:col-span-2 lg:col-span-4 flex flex-col gap-[var(--gap-grid)]">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className={[
                  'flex items-center gap-1.5 rounded-md px-3 py-2 font-semibold text-foreground',
                  'min-h-[44px] bg-muted hover:bg-muted/70 transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                ].join(' ')}
                style={{ fontSize: 'var(--text-label)' }}
              >
                <CaretLeft aria-hidden="true" focusable="false" className="size-4" />
                {t('backToMap')}
              </button>
              <h2 className="font-semibold text-foreground truncate" style={{ fontSize: 'var(--text-card-title)' }}>
                {selectedLocation.name}
              </h2>
              {(selectedLocation.activeAlerts?.length ?? 0) > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 shrink-0"
                  style={{ fontSize: 'var(--text-micro)' }}
                >
                  <Warning aria-hidden="true" focusable="false" className="size-3" />
                  {t('alertCount', { count: selectedLocation.activeAlerts?.length ?? 0 })}
                </span>
              )}
            </div>

            <LocationMap
              locations={locations}
              selectedId={selectedId}
              onSelectLocation={setSelectedId}
              variant="hero"
              fallbackCenter={fallbackCenter}
            />

            {(() => {
              const activities = buildActivities(selectedLocation);
              const ariaLabel = `${t('activities.boating')} / ${t('activities.surfing')} / ${t('activities.fishing')} / ${t('activities.beachSafety')} — ${selectedLocation.name}`;
              return (
                <>
                  <div className="hidden md:block">
                    <ActivityTabs activities={activities} ariaLabel={ariaLabel} />
                  </div>
                  <div className="md:hidden">
                    <ActivityAccordion activities={activities} />
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}
    </PageLayout>
  );
}

export default MarinePage;
