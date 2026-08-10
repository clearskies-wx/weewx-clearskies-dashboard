// BeachProfileChart.test.tsx — C2 (L1-BOUNDARY-REBUILD-PLAN Phase C, P14,
// 2026-08-08): unit tests for `selectDominantPartitionBreakPoints`, the
// helper that picks which swell's break points drive the drawn wave train
// (dominant partition only, mirroring the backend's own dominance
// criterion — largest face height). Full chart render is exercised
// elsewhere (BeachProfileCardBody.test.tsx); this file is scoped to the
// pure selection helper per the round brief.

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { selectDominantPartitionBreakPoints, BeachProfileChart } from './BeachProfileChart';
import type { BeachProfileBreakPoint, BeachProfilePoint } from '../../../api/types';

// ---------------------------------------------------------------------------
// react-i18next mock (same pattern as BeachProfileCardBody.test.tsx) — used
// by the R3.2/LABELS full-render tests below.
// ---------------------------------------------------------------------------
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

function bp(overrides: Partial<BeachProfileBreakPoint>): BeachProfileBreakPoint {
  return {
    distance: 0,
    depth: 1,
    hs: null,
    breakerType: null,
    faceHeight: null,
    iribarren: null,
    partitionInfo: null,
    ...overrides,
  };
}

describe('selectDominantPartitionBreakPoints', () => {
  it('returns an empty array unchanged', () => {
    expect(selectDominantPartitionBreakPoints([])).toEqual([]);
  });

  it('post-R5 single-partition input: all entries share partitionIndex, all returned', () => {
    const points = [
      bp({ distance: 120, faceHeight: 4.2, partitionInfo: { partitionIndex: 0, periodS: 14, directionDeg: 270, classification: 'groundswell', heightM: 1.2 } }),
      bp({ distance: 60, faceHeight: 3.1, partitionInfo: { partitionIndex: 0, periodS: 14, directionDeg: 270, classification: 'groundswell', heightM: 1.2 } }),
    ];
    expect(selectDominantPartitionBreakPoints(points)).toEqual(points);
  });

  it('multi-partition input: selects the group with the largest faceHeight', () => {
    const smallSwell = bp({ distance: 90, faceHeight: 2.0, partitionInfo: { partitionIndex: 1, periodS: 8, directionDeg: 200, classification: 'wind_swell', heightM: 0.6 } });
    const bigSwellOuter = bp({ distance: 150, faceHeight: 5.5, partitionInfo: { partitionIndex: 0, periodS: 15, directionDeg: 280, classification: 'groundswell', heightM: 1.6 } });
    const bigSwellInner = bp({ distance: 40, faceHeight: 4.0, partitionInfo: { partitionIndex: 0, periodS: 15, directionDeg: 280, classification: 'groundswell', heightM: 1.6 } });

    const result = selectDominantPartitionBreakPoints([smallSwell, bigSwellOuter, bigSwellInner]);

    expect(result).toEqual([bigSwellOuter, bigSwellInner]);
    expect(result).not.toContain(smallSwell);
  });

  it('multi-partition input: falls back to hs when faceHeight is null', () => {
    const smallSwell = bp({ distance: 90, hs: 1.5, partitionInfo: { partitionIndex: 1, periodS: 8, directionDeg: 200, classification: 'wind_swell', heightM: 0.5 } });
    const bigSwell = bp({ distance: 150, hs: 3.2, partitionInfo: { partitionIndex: 0, periodS: 15, directionDeg: 280, classification: 'groundswell', heightM: 1.4 } });

    expect(selectDominantPartitionBreakPoints([smallSwell, bigSwell])).toEqual([bigSwell]);
  });

  it('any entry missing partitionInfo (pre-T4A.6 cached data): returned unchanged, no grouping attempted', () => {
    const points = [
      bp({ distance: 90, faceHeight: 2.0, partitionInfo: { partitionIndex: 1, periodS: 8, directionDeg: 200, classification: 'wind_swell', heightM: 0.6 } }),
      bp({ distance: 150, faceHeight: 5.5, partitionInfo: null }),
    ];
    expect(selectDominantPartitionBreakPoints(points)).toEqual(points);
  });
});

// ---------------------------------------------------------------------------
// SURF-REMEDIATION R3.2 (2026-08-09) — fixed x-domain. The old tier logic
// picked the x-axis scale from the outermost break's distance
// (`selectTier`, deleted this round); R3.2 fixes the domain to
// `[+displayWindowM, -displayLandwardM]` from metadata regardless of break
// location. These fixtures differ ONLY in break distance (20 m vs 300 m,
// same metadata/transect) — the rendered x-axis tick set MUST be identical.
// This test FAILS against the pre-R3.2 tier logic (20 m -> tierShort
// 0..100/25; 300 m -> tierStandard 0..300/50 — different tick sets).
// ---------------------------------------------------------------------------

function transectPoint(overrides: Partial<BeachProfilePoint>): BeachProfilePoint {
  return { distance: 0, depth: 1, hs: 1, ...overrides };
}

function breakPoint(overrides: Partial<BeachProfileBreakPoint>): BeachProfileBreakPoint {
  return { distance: 0, depth: 1, hs: 1, breakerType: 'spilling', faceHeight: 2, iribarren: null, partitionInfo: null, ...overrides };
}

const BASE_TRANSECT: BeachProfilePoint[] = [
  transectPoint({ distance: 150, depth: 3, hs: 1.5 }),
  transectPoint({ distance: 75, depth: 1.5, hs: 1.2 }),
  transectPoint({ distance: 0, depth: 0.2, hs: 0.4 }),
];

// x-axis tick lines are the only <line> elements whose y2 lands on
// chartBottom+5 (see the "X-axis ticks + distance labels" render block) —
// distinct from the main x-axis line (y2=chartBottom) and the waterline
// marker (y1=PAD_TOP). PAD_TOP=32, PAD_BOTTOM=72, VIEW_H=292 ->
// CHART_H=188 -> chartBottom=220 -> tick y2=225.
function xTickPositions(container: HTMLElement): number[] {
  const lines = Array.from(container.querySelectorAll('line'));
  return lines
    .filter((l) => l.getAttribute('y2') === '225')
    .map((l) => Number(l.getAttribute('x1')))
    .sort((a, b) => a - b);
}

describe('R3.2 — fixed x-domain', () => {
  it('a break at 20 m and a break at 300 m yield IDENTICAL axis tick positions (metadata-driven domain)', () => {
    const commonProps = {
      transect: BASE_TRANSECT,
      heightUnit: 'ft',
      distanceUnit: 'm',
      locale: 'en-US',
      displayWindowM: 150,
      displayLandwardM: 30,
    };

    const { container: nearContainer } = render(
      <BeachProfileChart
        {...commonProps}
        breakPoints={[breakPoint({ distance: 20 })]}
      />,
    );
    const { container: farContainer } = render(
      <BeachProfileChart
        {...commonProps}
        breakPoints={[breakPoint({ distance: 300 })]}
      />,
    );

    const nearTicks = xTickPositions(nearContainer);
    const farTicks = xTickPositions(farContainer);
    expect(nearTicks.length).toBeGreaterThan(0);
    expect(nearTicks).toEqual(farTicks);
  });

  it('metadata absent falls back to the hardcoded 150/30 m Huntington preset, not the old tier logic', () => {
    const { container: withMeta } = render(
      <BeachProfileChart
        transect={BASE_TRANSECT}
        breakPoints={[breakPoint({ distance: 300 })]}
        heightUnit="ft"
        distanceUnit="m"
        locale="en-US"
        displayWindowM={150}
        displayLandwardM={30}
      />,
    );
    const { container: withoutMeta } = render(
      <BeachProfileChart
        transect={BASE_TRANSECT}
        breakPoints={[breakPoint({ distance: 300 })]}
        heightUnit="ft"
        distanceUnit="m"
        locale="en-US"
      />,
    );
    expect(xTickPositions(withoutMeta)).toEqual(xTickPositions(withMeta));
  });
});
