// almanac.tsx — Almanac page (/almanac)
//
// Thin route file: calls all data hooks, wires data to card components.
// All UI logic lives in src/components/almanac/*.tsx.
// Pattern mirrors forecast.tsx (Grid + PageHeaderCard composition).

import { useTranslation } from 'react-i18next';
import { MoonStars } from '@phosphor-icons/react';
import { PageLayout } from '../components/layout/page-layout';
import { SunMoonDetailCard } from '../components/almanac/SunMoonDetailCard';
import { PlanetTimelineCard } from '../components/almanac/PlanetTimelineCard';
import { MonthlyAveragesCard } from '../components/almanac/MonthlyAveragesCard';
import { SolarEclipseCard } from '../components/almanac/SolarEclipseCard';
import { LunarEclipseCard } from '../components/almanac/LunarEclipseCard';
import { MeteorShowerCard } from '../components/almanac/MeteorShowerCard';
import { useMemo } from 'react';
import {
  useAlmanac,
  useAlmanacMoonNames,
  useAlmanacPlanets,
  useGroupedArchive,
  useSolarEclipses,
  useAlmanacEclipses,
  useAlmanacMeteorShowers,
  useStation,
} from '../hooks/useWeatherData';

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

  // Station timezone — same pattern as forecast.tsx
  const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC';

  // Compute today/tomorrow date strings in station timezone
  const todayStr = useMemo(() => stationDate(stationTz, 0), [stationTz]);
  const tomorrowStr = useMemo(() => stationDate(stationTz, 1), [stationTz]);

  // Data hooks — fetch today and tomorrow for Sun & Moon two-column layout
  const almanac         = useAlmanac(todayStr);
  const almanacTomorrow = useAlmanac(tomorrowStr);
  const moonNames       = useAlmanacMoonNames();
  const planets       = useAlmanacPlanets();
  const monthlyAverages = useGroupedArchive({
    group_by: 'month',
    fields: 'outTemp:avg:max,outTemp:avg:min,dewpoint:avg,rain:avg:sum',
  });
  const solarEclipses = useSolarEclipses();
  const lunarEclipses = useAlmanacEclipses();
  const meteorShowers = useAlmanacMeteorShowers();

  return (
    <PageLayout title={t('pageTitle')} icon={<MoonStars weight="duotone" />}>
        {/* ── Surface D: Monthly Averages chart (first per approved mockup) ── */}
        <MonthlyAveragesCard
          groupedData={monthlyAverages.data}
          loading={monthlyAverages.loading}
          error={monthlyAverages.error?.message ?? null}
        />

        {/* ── Surface B: Sun & Moon detail ──────────────────────────────── */}
        <SunMoonDetailCard
          almanac={almanac.data}
          almanacTomorrow={almanacTomorrow.data}
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
