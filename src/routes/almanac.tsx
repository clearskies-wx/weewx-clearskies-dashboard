// almanac.tsx — Almanac page (/almanac)
//
// Thin route file: calls all data hooks, wires data to card components.
// All UI logic lives in src/components/almanac/*.tsx.
// Pattern mirrors forecast.tsx (Grid + PageHeaderCard composition).

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MoonStars } from '@phosphor-icons/react';
import { PageLayout } from '../components/layout/page-layout';
import { SunMoonDetailCard } from '../components/almanac/SunMoonDetailCard';
import { PlanetTimelineCard } from '../components/almanac/PlanetTimelineCard';
import { SolarEclipseCard } from '../components/almanac/SolarEclipseCard';
import { LunarEclipseCard } from '../components/almanac/LunarEclipseCard';
import { MeteorShowerCard } from '../components/almanac/MeteorShowerCard';
import { ConfigDrivenGroup } from '../components/charts/ConfigDrivenGroup';
import {
  useAlmanac,
  useAlmanacMoonNames,
  useAlmanacPlanets,
  useAlmanacPositions,
  useChartsConfig,
  useSolarEclipses,
  useAlmanacEclipses,
  useAlmanacMeteorShowers,
  useStation,
} from '../hooks/useWeatherData';

// ---------------------------------------------------------------------------
// usePrefersReducedMotion — local hook, passed down to ConfigDrivenGroup
// ---------------------------------------------------------------------------

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

/** Compute a YYYY-MM-DD date string in the station timezone. */
function stationDate(tz: string, offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AlmanacPage() {
  const { t } = useTranslation('almanac');
  const reducedMotion = usePrefersReducedMotion();

  // Station timezone — same pattern as forecast.tsx
  const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC';
  const stationFirstYear = station?.firstRecord
    ? new Date(station.firstRecord).getFullYear()
    : undefined;

  // Compute today/tomorrow date strings in station timezone
  const todayStr = useMemo(() => stationDate(stationTz, 0), [stationTz]);
  const tomorrowStr = useMemo(() => stationDate(stationTz, 1), [stationTz]);

  // Charts config — used to find the grouped chart group (xAxisGroupby)
  const { data: chartsConfig } = useChartsConfig();
  const groupedChartGroup = chartsConfig?.groups?.find(
    (g) => g.charts.some((c) => c.xAxisGroupby)
  ) ?? null;

  // Data hooks — fetch today and tomorrow for Sun & Moon two-column layout
  const almanac         = useAlmanac(todayStr);
  const almanacTomorrow = useAlmanac(tomorrowStr);
  const positions       = useAlmanacPositions();
  const moonNames       = useAlmanacMoonNames();
  const planets         = useAlmanacPlanets();
  const solarEclipses   = useSolarEclipses();
  const lunarEclipses   = useAlmanacEclipses();
  const meteorShowers   = useAlmanacMeteorShowers();

  return (
    <PageLayout title={t('pageTitle')} icon={<MoonStars weight="duotone" />}>
        {/* ── Surface D: Monthly Averages chart (first per approved mockup) ── */}
        {groupedChartGroup && (
          <div className="col-span-1 md:col-span-2 lg:col-span-4">
            <ConfigDrivenGroup
              group={groupedChartGroup}
              globalColors={chartsConfig?.colors}
              globalType={chartsConfig?.type}
              reducedMotion={reducedMotion}
              stationFirstYear={stationFirstYear}
              archiveIntervalSeconds={station?.archiveIntervalSeconds}
              weekStartDay={station?.weekStartDay}
              hideControls
            />
          </div>
        )}

        {/* ── Surface B: Sun & Moon detail ──────────────────────────────── */}
        <SunMoonDetailCard
          almanac={almanac.data}
          almanacTomorrow={almanacTomorrow.data}
          positions={positions.data ?? null}
          moonNames={moonNames.data}
          stationTz={stationTz}
          loading={almanac.loading}
          error={almanac.error?.message ?? null}
        />

        {/* ── Surface C: Tonight's Planet Outlook ───────────────────────── */}
        <PlanetTimelineCard
          planets={planets.data}
          almanac={almanac.data}
          stationTz={stationTz}
          loading={planets.loading}
          error={planets.error?.message ?? null}
        />

        {/* ── Surface E: Solar Eclipses ─────────────────────────────────── */}
        <SolarEclipseCard
          eclipses={solarEclipses.data}
          stationTz={stationTz}
          loading={solarEclipses.loading}
          error={solarEclipses.error?.message ?? null}
        />

        {/* ── Surface F: Lunar Eclipses ─────────────────────────────────── */}
        <LunarEclipseCard
          eclipses={lunarEclipses.data}
          stationTz={stationTz}
          loading={lunarEclipses.loading}
          error={lunarEclipses.error?.message ?? null}
        />

        {/* ── Surface G: Meteor Showers ─────────────────────────────────── */}
        <MeteorShowerCard
          showers={meteorShowers.data?.showers ?? null}
          stationTz={stationTz}
          loading={meteorShowers.loading}
          error={meteorShowers.error?.message ?? null}
        />
    </PageLayout>
  );
}

export default AlmanacPage;
