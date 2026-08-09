// BeachProfileChart.test.tsx — C2 (L1-BOUNDARY-REBUILD-PLAN Phase C, P14,
// 2026-08-08): unit tests for `selectDominantPartitionBreakPoints`, the
// helper that picks which swell's break points drive the drawn wave train
// (dominant partition only, mirroring the backend's own dominance
// criterion — largest face height). Full chart render is exercised
// elsewhere (BeachProfileCardBody.test.tsx); this file is scoped to the
// pure selection helper per the round brief.

import { describe, it, expect } from 'vitest';
import { selectDominantPartitionBreakPoints } from './BeachProfileChart';
import type { BeachProfileBreakPoint } from '../../../api/types';

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
