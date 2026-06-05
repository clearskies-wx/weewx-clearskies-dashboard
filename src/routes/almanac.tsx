// almanac.tsx — Almanac page (/almanac)
//
// Thin route file: calls all data hooks, wires data to card components.
// All UI logic lives in src/components/almanac/*.tsx.
// Pattern mirrors forecast.tsx (Grid + PageHeaderCard composition).

import { useTranslation } from 'react-i18next';
import { MoonStars } from '@phosphor-icons/react';
import { Grid } from '../components/layout/grid';
import { PageHeaderCard } from '../components/layout/page-header-card';
import { SunMoonDetailCard } from '../components/almanac/SunMoonDetailCard';
import { PlanetTimelineCard } from '../components/almanac/PlanetTimelineCard';
import { MonthlyAveragesCard } from '../components/almanac/MonthlyAveragesCard';
import { SolarEclipseCard } from '../components/almanac/SolarEclipseCard';
import { LunarEclipseCard } from '../components/almanac/LunarEclipseCard';
import { MeteorShowerCard } from '../components/almanac/MeteorShowerCard';
import {
  useAlmanac,
  useAlmanacMoonNames,
  useAlmanacPlanets,
  useClimatologyMonthly,
  useSolarEclipses,
  useAlmanacEclipses,
  useAlmanacMeteorShowers,
  useStation,
} from '../hooks/useWeatherData';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AlmanacPage() {
  const { t } = useTranslation('almanac');

  // Station timezone — same pattern as forecast.tsx
  const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC';

  // Data hooks
  const almanac       = useAlmanac();
  const moonNames     = useAlmanacMoonNames();
  const planets       = useAlmanacPlanets();
  const climatology   = useClimatologyMonthly();
  const solarEclipses = useSolarEclipses();
  const lunarEclipses = useAlmanacEclipses();
  const meteorShowers = useAlmanacMeteorShowers();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{t('pageTitle')}</h1>

      <Grid className="md:auto-rows-[auto]">
        {/* ── Page header ──────────────────────────────────────────────── */}
        <PageHeaderCard
          title={t('pageTitle')}
          icon={<MoonStars weight="duotone" />}
          as="h1"
        />

        {/* ── Surface B: Sun & Moon detail ──────────────────────────────── */}
        <SunMoonDetailCard
          almanac={almanac.data}
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

        {/* ── Surface D: Monthly Averages chart ─────────────────────────── */}
        <MonthlyAveragesCard
          climatology={climatology.data}
          loading={climatology.loading}
          error={climatology.error?.message ?? null}
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
      </Grid>
    </div>
  );
}

export default AlmanacPage;
