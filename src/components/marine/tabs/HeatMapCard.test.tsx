// HeatMapCard.test.tsx — SURF-PUBLISH-RESULTS-ONLY §3.6 (2026-07-25).
//
// Same contract as BeachProfileCardBody.test.tsx, for the all-transect
// (?transect_index=all) response this card renders:
//   - Fetch error -> role="alert", destructive styling, retry button.
//   - modelStatus: "unavailable" (profiles: null) -> muted informational
//     text naming the model gap. NOT an alert. Must not crash on the null
//     `profiles` array (this is the exact shape that used to throw at
//     `data.profiles.length` before this round's null-guard fix).
//   - modelStatus: "ok" -> the SVG heat map renders as before.
//   - Error takes priority over modelStatus/data, matching the ordering
//     rule applied to BeachProfileCardBody.

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { HeatMapCard } from './HeatMapCard';
import type {
  HeatMapProfileDataOk,
  HeatMapProfileDataUnavailable,
  HeatMapTransectData,
} from '../../../api/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

const ROW: HeatMapTransectData = {
  transectIndex: 0,
  isStructureAffected: false,
  transectBearingDeg: 245,
  transect: [
    { distance: 300, depth: 9, hs: 2.8, swellHeight: 2.6, breakingFraction: null },
    { distance: 50, depth: 2, hs: 3.4, swellHeight: 2.9, breakingFraction: 0.7 },
  ],
  breakPoints: [],
  waveShapes: [],
  surfZones: null,
  jackingFactors: [],
  handoffDepthM: 4.8,
  handoffSourceLevel: 'L3',
};

const UNAVAILABLE_RESPONSE: HeatMapProfileDataUnavailable = {
  locationId: 'huntington-city-beach-pier',
  timestep: null,
  modelStatus: 'unavailable',
  profiles: null,
  perPartitionBreaks: null,
  metadata: {
    axisUnits: { x: 'ft', y: 'ft' },
    verticalDatum: null,
    transectCount: null,
    openTransectCount: null,
    handoffDepthM: null,
    handoffSourceLevel: null,
  },
};

const OK_RESPONSE: HeatMapProfileDataOk = {
  locationId: 'huntington-city-beach-pier',
  timestep: '2026-07-25T19:00:00Z',
  modelStatus: 'ok',
  profiles: [ROW],
  perPartitionBreaks: [],
  metadata: {
    axisUnits: { x: 'ft', y: 'ft' },
    verticalDatum: 'NAVD88',
    transectCount: 1,
    openTransectCount: 1,
    handoffDepthM: 4.8,
    handoffSourceLevel: 'L3',
  },
};

const FETCH_ERROR = new Error('404: Surf location not found');

const baseProps = {
  heightUnit: 'ft',
  distanceUnit: 'ft',
  locale: 'en',
};

describe('HeatMapCard', () => {
  it('loading: renders a loading indicator, no alert, no chart', () => {
    const { queryByRole } = render(
      <HeatMapCard {...baseProps} data={null} loading={true} />,
    );
    expect(queryByRole('alert')).toBeNull();
    expect(queryByRole('img')).toBeNull();
  });

  it('error: renders role="alert" with destructive text and a working retry button', () => {
    const onRetry = vi.fn();
    const { getByRole } = render(
      <HeatMapCard {...baseProps} data={null} loading={false} error={FETCH_ERROR} onRetry={onRetry} />,
    );
    const alert = getByRole('alert');
    expect(alert.textContent).toContain('surfing.heatMap.loadError');

    getByRole('button', { name: 'retry' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('error takes priority even when stale "ok" data is still cached', () => {
    // Mirrors useApiQuery's real behavior: a background refetch failure sets
    // `error` without clearing previously cached `data`. The error must
    // still win so a visitor is told the fetch failed, not shown a
    // silently-stale chart.
    const { getByRole, queryByRole } = render(
      <HeatMapCard {...baseProps} data={OK_RESPONSE} loading={false} error={FETCH_ERROR} />,
    );
    expect(getByRole('alert')).toBeDefined();
    expect(queryByRole('img')).toBeNull();
  });

  it('modelStatus "unavailable": renders informational text with NO alert role, and does not throw on profiles: null', () => {
    let queryByRole: ReturnType<typeof render>['queryByRole'];
    let getByText: ReturnType<typeof render>['getByText'];
    expect(() => {
      ({ queryByRole, getByText } = render(
        <HeatMapCard {...baseProps} data={UNAVAILABLE_RESPONSE} loading={false} />,
      ));
    }).not.toThrow();
    expect(queryByRole!('alert')).toBeNull();
    expect(getByText!('surfing.heatMap.modelUnavailable')).toBeDefined();
  });

  it('modelStatus "ok": renders the SVG heat map (role="img"), not an error or unavailable message', () => {
    const { getByRole, queryByRole, queryByText } = render(
      <HeatMapCard {...baseProps} data={OK_RESPONSE} loading={false} />,
    );
    expect(getByRole('img')).toBeDefined();
    expect(queryByRole('alert')).toBeNull();
    expect(queryByText('surfing.heatMap.modelUnavailable')).toBeNull();
  });

  it('no data yet (skip / not fetched): renders the pre-existing generic empty state, not an alert', () => {
    const { queryByRole, getByText } = render(
      <HeatMapCard {...baseProps} data={null} loading={false} />,
    );
    expect(queryByRole('alert')).toBeNull();
    expect(getByText('surfing.heatMapNoData')).toBeDefined();
  });
});
