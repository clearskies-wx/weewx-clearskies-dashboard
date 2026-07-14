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
import { footprintColSpan } from '../components/ui/card';
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

/**
 * Responsive map layout (T3.9, DASHBOARD-MANUAL §12): computes the
 * width/height aspect ratio of the configured locations' bounding box,
 * adjusting the longitude span by cos(centerLat) so degrees-longitude are
 * weighted correctly relative to degrees-latitude at the site's latitude
 * (a degree of longitude shrinks toward the poles; latitude doesn't).
 *
 *   aspect >= 0.8  -> horizontal/square spread  -> map full-width above cards
 *   aspect <  0.8  -> vertical (north-south) spread -> map as a side panel
 *                     at lg with cards stacked beside it
 *
 * Fewer than 2 locations (or a degenerate single-point spread) has no
 * meaningful shape to measure — defaults to the horizontal layout, matching
 * the simple full-width map that's always been correct for a single point.
 */
function computeMapAspectRatio(locations: MarineLocationSummary[]): number {
  if (locations.length < 2) return 1;
  const lats = locations.map((l) => l.coordinates.lat);
  const lons = locations.map((l) => l.coordinates.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const centerLat = (minLat + maxLat) / 2;
  const latSpan = maxLat - minLat;
  const lonSpan = (maxLon - minLon) * Math.cos((centerLat * Math.PI) / 180);
  if (latSpan === 0 && lonSpan === 0) return 1;
  if (latSpan === 0) return Number.POSITIVE_INFINITY;
  return lonSpan / latSpan;
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
  // Linked hover (T3.6): shared between LocationMap's numbered pins and the
  // LocationCard grid so hovering either highlights the other.
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const selectedLocation = useMemo(
    () => (locations ?? []).find((l) => l.locationId === selectedId) ?? null,
    [locations, selectedId],
  );

  // Responsive map layout (T3.9): aspect < 0.8 means the configured
  // locations spread north-south more than east-west, so the map reads
  // better as a tall side panel than a short full-width strip.
  const mapAspect = useMemo(() => computeMapAspectRatio(locations ?? []), [locations]);
  const isVerticalLayout = mapAspect < 0.8;
  const landingMapHeight = isVerticalLayout ? 600 : 400;

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

      {!loading && !error && locations !== null && locations.length > 0 && selectedLocation === null && isVerticalLayout && (
        <>
          {/* Landing state, vertical layout (T3.9): site's locations spread
              north-south, so at lg the map is a ~3/4-width side panel with
              cards stacked in the remaining column; below lg it stacks
              (map on top, cards below) — same responsive pattern as the
              Seismic page's map+list split (src/routes/seismic.tsx). */}
          <div className={`${footprintColSpan.full} flex flex-col gap-[var(--gap-grid)] lg:flex-row lg:items-start`}>
            <div className="lg:w-3/4 lg:shrink-0">
              <h2 className="sr-only">{t('map.ariaLabel')}</h2>
              <LocationMap
                locations={locations}
                selectedId={selectedId}
                onSelectLocation={setSelectedId}
                variant="full"
                fallbackCenter={fallbackCenter}
                height={landingMapHeight}
                hoveredId={hoveredId}
                onHoverLocation={setHoveredId}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--gap-grid)] lg:flex lg:flex-1 lg:flex-col">
              {locations.map((loc, i) => (
                <LocationCard
                  key={loc.locationId}
                  index={i}
                  location={loc}
                  units={units}
                  locale={locale}
                  onSelect={setSelectedId}
                  isHovered={hoveredId === loc.locationId}
                  onHover={setHoveredId}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {!loading && !error && locations !== null && locations.length > 0 && selectedLocation === null && !isVerticalLayout && (
        <>
          {/* Landing state, horizontal layout (T3.9 default): map and
              LocationCards are direct Grid children — no internal grid
              wrappers (DASHBOARD-MANUAL §12 / T3.4). */}
          <div className={footprintColSpan.full}>
            <h2 className="sr-only">{t('map.ariaLabel')}</h2>
            <LocationMap
              locations={locations}
              selectedId={selectedId}
              onSelectLocation={setSelectedId}
              variant="full"
              fallbackCenter={fallbackCenter}
              height={landingMapHeight}
              hoveredId={hoveredId}
              onHoverLocation={setHoveredId}
            />
          </div>

          {locations.map((loc, i) => (
            <LocationCard
              key={loc.locationId}
              index={i}
              location={loc}
              units={units}
              locale={locale}
              onSelect={setSelectedId}
              isHovered={hoveredId === loc.locationId}
              onHover={setHoveredId}
            />
          ))}
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
