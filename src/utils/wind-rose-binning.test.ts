// wind-rose-binning.test.ts — Unit tests for buildWindRoseMatrix.
//
// Covers: direction bin formula edge cases, Beaufort cap at 6+, calm handling,
// null/incomplete records, percentage math, empty input, ConvertedValue shape.

import { describe, it, expect } from 'vitest';
import { buildWindRoseMatrix } from './wind-rose-binning';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid non-calm record with raw field values. */
function makeRecord(windSpeed: number | null, windDir: number | null, beaufort: number | null): Record<string, unknown> {
  return { windSpeed, windDir, beaufort };
}

/** Build a record where beaufort is a ConvertedValue object (BFF shape). */
function makeRecordWithConvertedBeaufort(
  windSpeed: number | null,
  windDir: number | null,
  beaufortValue: number,
): Record<string, unknown> {
  return {
    windSpeed,
    windDir,
    beaufort: {
      value: beaufortValue,
      label: `Beaufort ${beaufortValue}`,
      formatted: String(beaufortValue),
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Empty input
// ---------------------------------------------------------------------------

describe('buildWindRoseMatrix — empty input', () => {
  it('returns zero totalRecords and zero calmPercentage for an empty array', () => {
    const result = buildWindRoseMatrix([]);
    expect(result.totalRecords).toBe(0);
    expect(result.calmPercentage).toBe(0);
  });

  it('returns a 16×7 matrix of zeros for an empty array', () => {
    const result = buildWindRoseMatrix([]);
    expect(result.bins).toHaveLength(16);
    result.bins.forEach((row) => {
      expect(row).toHaveLength(7);
      row.forEach((cell) => expect(cell).toBe(0));
    });
  });

  it('returns the 16 compass direction labels in correct clockwise order', () => {
    const result = buildWindRoseMatrix([]);
    expect(result.directions).toEqual([
      'N', 'NNE', 'NE', 'ENE',
      'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW',
      'W', 'WNW', 'NW', 'NNW',
    ]);
  });

  it('returns 7 Beaufort categories starting from Calm through Strong+', () => {
    const result = buildWindRoseMatrix([]);
    expect(result.categories).toHaveLength(7);
    expect(result.categories[0]).toEqual({ beaufort: 0, label: 'Calm' });
    expect(result.categories[6]).toEqual({ beaufort: 6, label: 'Strong+' });
  });
});

// ---------------------------------------------------------------------------
// 2. Direction formula edge cases
// ---------------------------------------------------------------------------

describe('buildWindRoseMatrix — direction bin formula', () => {
  it('bins 0° into N (bin index 0)', () => {
    const result = buildWindRoseMatrix([makeRecord(5, 0, 2)]);
    // Bin 0 (N), Beaufort 2
    expect(result.bins[0][2]).toBeGreaterThan(0);
  });

  it('bins 359° into N (bin index 0) — wraps back to N', () => {
    const result = buildWindRoseMatrix([makeRecord(5, 359, 2)]);
    // (359 + 11.25) % 360 = 10.25 → floor(10.25 / 22.5) = 0 → N
    expect(result.bins[0][2]).toBeGreaterThan(0);
    // All other direction bins at Beaufort 2 must be 0
    for (let d = 1; d < 16; d++) {
      expect(result.bins[d][2]).toBe(0);
    }
  });

  it('bins 180° into S (bin index 8)', () => {
    const result = buildWindRoseMatrix([makeRecord(5, 180, 2)]);
    // (180 + 11.25) % 360 = 191.25 → floor(191.25 / 22.5) = 8 → S
    expect(result.bins[8][2]).toBeGreaterThan(0);
    for (let d = 0; d < 16; d++) {
      if (d !== 8) expect(result.bins[d][2]).toBe(0);
    }
  });

  it('bins 90° into E (bin index 4)', () => {
    const result = buildWindRoseMatrix([makeRecord(5, 90, 2)]);
    // (90 + 11.25) % 360 = 101.25 → floor(101.25 / 22.5) = 4 → E
    expect(result.bins[4][2]).toBeGreaterThan(0);
    for (let d = 0; d < 16; d++) {
      if (d !== 4) expect(result.bins[d][2]).toBe(0);
    }
  });

  it('bins exactly 11.25° into NNE (bin index 1) — lower boundary of NNE', () => {
    // (11.25 + 11.25) % 360 = 22.5 → floor(22.5 / 22.5) = 1 → NNE
    const result = buildWindRoseMatrix([makeRecord(5, 11.25, 2)]);
    expect(result.bins[1][2]).toBeGreaterThan(0);
    expect(result.bins[0][2]).toBe(0);
  });

  it('bins just below 11.25° (11.24°) into N (bin index 0) — upper boundary of N', () => {
    // (11.24 + 11.25) % 360 = 22.49 → floor(22.49 / 22.5) = 0 → N
    const result = buildWindRoseMatrix([makeRecord(5, 11.24, 2)]);
    expect(result.bins[0][2]).toBeGreaterThan(0);
    expect(result.bins[1][2]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Beaufort cap at 6+
// ---------------------------------------------------------------------------

describe('buildWindRoseMatrix — Beaufort cap at 6+', () => {
  it('bins Beaufort 7 into category index 6 (the 6+ bucket)', () => {
    const result = buildWindRoseMatrix([makeRecord(20, 180, 7)]);
    expect(result.bins[8][6]).toBeGreaterThan(0);
    // Ensure it did not land in any lower Beaufort bucket for that direction
    for (let b = 0; b < 6; b++) {
      expect(result.bins[8][b]).toBe(0);
    }
  });

  it('bins Beaufort 8 into category index 6 (the 6+ bucket)', () => {
    const result = buildWindRoseMatrix([makeRecord(25, 180, 8)]);
    expect(result.bins[8][6]).toBeGreaterThan(0);
  });

  it('bins Beaufort 12 (hurricane) into category index 6 (the 6+ bucket)', () => {
    const result = buildWindRoseMatrix([makeRecord(40, 180, 12)]);
    expect(result.bins[8][6]).toBeGreaterThan(0);
  });

  it('does not create an eighth Beaufort bucket when values exceed 6', () => {
    const result = buildWindRoseMatrix([makeRecord(40, 180, 12)]);
    expect(result.bins[8]).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// 4. Calm handling
// ---------------------------------------------------------------------------

describe('buildWindRoseMatrix — calm handling', () => {
  it('counts windSpeed=0 as calm, not binned into any direction', () => {
    const result = buildWindRoseMatrix([makeRecord(0, 180, 1)]);
    expect(result.totalRecords).toBe(1);
    expect(result.calmPercentage).toBe(100);
    result.bins.forEach((row) => row.forEach((cell) => expect(cell).toBe(0)));
  });

  it('counts windSpeed=null as calm', () => {
    const result = buildWindRoseMatrix([makeRecord(null, 180, 1)]);
    expect(result.totalRecords).toBe(1);
    expect(result.calmPercentage).toBe(100);
  });

  it('does not count record with windSpeed=null, windDir=null, beaufort=null as any kind of record', () => {
    // Completely absent — should be skipped entirely
    const result = buildWindRoseMatrix([makeRecord(null, null, null)]);
    expect(result.totalRecords).toBe(0);
    expect(result.calmPercentage).toBe(0);
  });

  it('correctly calculates calm percentage across a mixed set', () => {
    // 2 calm records + 2 non-calm records → 50% calm
    const records = [
      makeRecord(0, 90, 1),   // calm
      makeRecord(null, 90, 1), // calm (null speed)
      makeRecord(5, 90, 2),   // non-calm, binnable
      makeRecord(8, 270, 3),  // non-calm, binnable
    ];
    const result = buildWindRoseMatrix(records);
    expect(result.totalRecords).toBe(4);
    expect(result.calmPercentage).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// 5. Null / incomplete records
// ---------------------------------------------------------------------------

describe('buildWindRoseMatrix — null and incomplete records', () => {
  it('skips a record where windSpeed, windDir, and beaufort are all null (totalRecords stays 0)', () => {
    const result = buildWindRoseMatrix([makeRecord(null, null, null)]);
    expect(result.totalRecords).toBe(0);
  });

  it('counts a record with windSpeed but no windDir as valid but does not bin it', () => {
    // windSpeed present, windDir null → valid non-calm record, cannot be binned
    const result = buildWindRoseMatrix([makeRecord(5, null, 2)]);
    expect(result.totalRecords).toBe(1);
    expect(result.calmPercentage).toBe(0);
    result.bins.forEach((row) => row.forEach((cell) => expect(cell).toBe(0)));
  });

  it('counts a record with windSpeed but no beaufort as valid but does not bin it', () => {
    const result = buildWindRoseMatrix([makeRecord(5, 90, null)]);
    expect(result.totalRecords).toBe(1);
    expect(result.calmPercentage).toBe(0);
    result.bins.forEach((row) => row.forEach((cell) => expect(cell).toBe(0)));
  });

  it('handles extra unknown fields on a record without throwing', () => {
    const record: Record<string, unknown> = {
      windSpeed: 5,
      windDir: 90,
      beaufort: 2,
      outTemp: { value: 22, label: 'Temperature', formatted: '22 °C' },
      dateTime: 1700000000,
    };
    expect(() => buildWindRoseMatrix([record])).not.toThrow();
    const result = buildWindRoseMatrix([record]);
    expect(result.totalRecords).toBe(1);
    expect(result.bins[4][2]).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Percentage math
// ---------------------------------------------------------------------------

describe('buildWindRoseMatrix — percentage math', () => {
  it('bin percentages for non-calm records sum to 100%', () => {
    // Four non-calm records spread across two direction bins
    const records = [
      makeRecord(5, 90, 2),  // E, Beaufort 2
      makeRecord(5, 90, 3),  // E, Beaufort 3
      makeRecord(5, 270, 2), // W, Beaufort 2
      makeRecord(5, 270, 3), // W, Beaufort 3
    ];
    const result = buildWindRoseMatrix(records);
    let total = 0;
    result.bins.forEach((row) => row.forEach((cell) => (total += cell)));
    expect(total).toBeCloseTo(100, 5);
  });

  it('calm percentage is relative to all valid records (including calm)', () => {
    // 1 calm out of 4 valid = 25%
    const records = [
      makeRecord(0, 90, 1),  // calm
      makeRecord(5, 90, 2),  // binnable
      makeRecord(5, 180, 3), // binnable
      makeRecord(5, 270, 1), // binnable
    ];
    const result = buildWindRoseMatrix(records);
    expect(result.calmPercentage).toBeCloseTo(25, 5);
  });

  it('calm percentage is excluded from the bin percentages (bins reflect only non-calm)', () => {
    // 1 calm + 1 binnable → bin should be 100% of non-calm (= 1 record)
    const records = [
      makeRecord(0, 90, 1), // calm
      makeRecord(5, 90, 2), // E, Beaufort 2
    ];
    const result = buildWindRoseMatrix(records);
    // E is bin index 4, Beaufort 2 is index 2
    expect(result.bins[4][2]).toBeCloseTo(100, 5);
    // Calm is 50% of total valid records
    expect(result.calmPercentage).toBeCloseTo(50, 5);
  });

  it('all bin cells are zero when the only valid records are calm', () => {
    const records = [
      makeRecord(0, 90, 1),
      makeRecord(0, 180, 2),
    ];
    const result = buildWindRoseMatrix(records);
    result.bins.forEach((row) => row.forEach((cell) => expect(cell).toBe(0)));
    expect(result.calmPercentage).toBe(100);
  });

  it('all bin cells are zero when valid records exist but none are binnable (no windDir/beaufort)', () => {
    const records = [
      makeRecord(5, null, 2), // has speed, missing dir
      makeRecord(5, 90, null), // has speed, missing beaufort
    ];
    const result = buildWindRoseMatrix(records);
    result.bins.forEach((row) => row.forEach((cell) => expect(cell).toBe(0)));
    expect(result.totalRecords).toBe(2);
    expect(result.calmPercentage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. ConvertedValue shape for beaufort
// ---------------------------------------------------------------------------

describe('buildWindRoseMatrix — ConvertedValue beaufort shape', () => {
  it('extracts beaufort from a ConvertedValue object with value/label/formatted', () => {
    const record = makeRecordWithConvertedBeaufort(5, 90, 3);
    const result = buildWindRoseMatrix([record]);
    // E = bin 4, Beaufort 3 = bin 3
    expect(result.totalRecords).toBe(1);
    expect(result.bins[4][3]).toBeCloseTo(100, 5);
  });

  it('applies the Beaufort cap correctly when beaufort comes as a ConvertedValue', () => {
    // ConvertedValue with value=9 should cap to bin index 6
    const record = makeRecordWithConvertedBeaufort(30, 180, 9);
    const result = buildWindRoseMatrix([record]);
    // S = bin 8, Beaufort 6+ = bin 6
    expect(result.bins[8][6]).toBeCloseTo(100, 5);
    for (let b = 0; b < 6; b++) {
      expect(result.bins[8][b]).toBe(0);
    }
  });

  it('handles a mix of raw-number and ConvertedValue beaufort in the same record set', () => {
    const records: Record<string, unknown>[] = [
      makeRecord(5, 90, 2),                        // raw number beaufort
      makeRecordWithConvertedBeaufort(5, 90, 2),   // ConvertedValue beaufort
    ];
    const result = buildWindRoseMatrix(records);
    // Both land in E (bin 4), Beaufort 2 (bin 2) → 2 counts out of 2 non-calm
    expect(result.bins[4][2]).toBeCloseTo(100, 5);
    expect(result.totalRecords).toBe(2);
  });
});
