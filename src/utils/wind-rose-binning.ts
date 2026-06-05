// wind-rose-binning.ts — Client-side wind rose bin computation.
//
// Consumes archive records emitted by the BFF. The BFF injects a `beaufort`
// ConvertedValue (ADR-042) and keeps `windDir` / `windSpeed` as raw numbers
// on ArchiveRecord. Because ArchiveRecord uses a wide index signature, this
// utility accepts `Record<string, unknown>[]` and narrows field shapes at
// runtime.
//
// Direction formula and Beaufort cap match the deleted API-side
// services/wind_rose.py so that client output is identical to the old
// server-side output.

import type { WindRoseData, BeaufortCategory, ConvertedValue } from '../api/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ordered compass labels for the 16 direction bins (0 = N, clockwise). */
const COMPASS_LABELS: string[] = [
  'N', 'NNE', 'NE', 'ENE',
  'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW',
  'W', 'WNW', 'NW', 'NNW',
];

/** Number of direction bins (16 × 22.5° slices). */
const DIR_BINS = 16;

/** Number of Beaufort categories displayed (0–5 individual, 6 = "6+"). */
const BEAUFORT_BINS = 7;

/**
 * Default Beaufort colors matching the deleted Python wind_rose.py constants.
 * Keys are string indices "0"–"6" to match WindRoseChart's beaufortColors prop.
 */
const DEFAULT_BEAUFORT_COLORS: Record<string, string> = {
  '0': '#4575b4', // Calm
  '1': '#74add1', // Light Air
  '2': '#abd9e9', // Light Breeze
  '3': '#fee090', // Gentle Breeze
  '4': '#fdae61', // Moderate Breeze
  '5': '#f46d43', // Fresh Breeze
  '6': '#d73027', // Strong+
};

/** Beaufort category metadata for the 7 display categories. */
const BEAUFORT_CATEGORIES: BeaufortCategory[] = [
  { beaufort: 0, label: 'Calm' },
  { beaufort: 1, label: 'Light Air' },
  { beaufort: 2, label: 'Light Breeze' },
  { beaufort: 3, label: 'Gentle Breeze' },
  { beaufort: 4, label: 'Moderate Breeze' },
  { beaufort: 5, label: 'Fresh Breeze' },
  { beaufort: 6, label: 'Strong+' },
];

// ---------------------------------------------------------------------------
// Runtime type helpers
// ---------------------------------------------------------------------------

/**
 * Narrow an unknown field value to a ConvertedValue if it has the right shape.
 * The BFF emits `{ value, label, formatted }` for computed fields like `beaufort`.
 */
function asConvertedValue(val: unknown): ConvertedValue | null {
  if (
    val !== null &&
    val !== undefined &&
    typeof val === 'object' &&
    'value' in val &&
    'label' in val &&
    'formatted' in val
  ) {
    return val as ConvertedValue;
  }
  return null;
}

/**
 * Extract a numeric value from a field that is either a raw number or a
 * ConvertedValue object. Returns null if the value is absent or non-numeric.
 */
function extractNumber(val: unknown): number | null {
  if (typeof val === 'number') return val;
  const cv = asConvertedValue(val);
  if (cv !== null && typeof cv.value === 'number') return cv.value;
  return null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Build a WindRoseData matrix from BFF archive records.
 *
 * Each record is expected to have:
 *   - `windSpeed`: raw `number | null` (ArchiveRecord shape)
 *   - `windDir`:   raw `number | null` (ArchiveRecord shape, degrees 0–360)
 *   - `beaufort`:  `ConvertedValue | null` injected by the BFF; `.value` is 0–12
 *
 * Records where windSpeed is null, zero, or where windDir / beaufort are
 * missing are treated as calm and counted separately.
 *
 * Percentage formula: each bin cell = (count / totalNonCalm) * 100
 * so that the bins represent the distribution of non-calm wind observations.
 *
 * @param records - Archive records from the BFF (typed broadly to accommodate
 *                  the ArchiveRecord index signature at runtime).
 */
export function buildWindRoseMatrix(records: Record<string, unknown>[]): WindRoseData {
  // Initialise the 16×7 count matrix and calm counter.
  const counts: number[][] = Array.from({ length: DIR_BINS }, () =>
    new Array<number>(BEAUFORT_BINS).fill(0),
  );

  let totalValid = 0;
  let calmCount = 0;

  for (const record of records) {
    const windSpeedVal = extractNumber(record['windSpeed']);
    const windDirVal = extractNumber(record['windDir']);
    const beaufortVal = extractNumber(record['beaufort']);

    // Skip records that are completely unusable (no wind data at all).
    if (windSpeedVal === null && windDirVal === null && beaufortVal === null) {
      continue;
    }

    totalValid++;

    // Calm: wind speed is zero or null.
    if (windSpeedVal === null || windSpeedVal === 0) {
      calmCount++;
      continue;
    }

    // Skip non-calm records that lack direction or Beaufort classification.
    if (windDirVal === null || beaufortVal === null) {
      // We still counted it as a valid record; it just can't be binned.
      continue;
    }

    // Direction bin: 16-bin formula matching wind_rose.py
    // ((degrees + 11.25) % 360) / 22.5 → floor to [0, 15]
    const dirBin = Math.floor(((windDirVal + 11.25) % 360) / 22.5);
    const safeDirBin = Math.min(Math.max(dirBin, 0), DIR_BINS - 1);

    // Beaufort bin: cap at 6 for the "6+" combined category.
    const beaufortBin = Math.min(Math.floor(beaufortVal), BEAUFORT_BINS - 1);
    const safeBeaufortBin = Math.max(beaufortBin, 0);

    counts[safeDirBin][safeBeaufortBin]++;
  }

  // Non-calm record count is the denominator for bin percentages.
  const nonCalmCount = totalValid - calmCount;

  // Build percentage bins.
  const bins: number[][] = counts.map((dirRow) =>
    dirRow.map((count) =>
      nonCalmCount > 0 ? (count / nonCalmCount) * 100 : 0,
    ),
  );

  // Calm percentage relative to all valid records.
  const calmPercentage = totalValid > 0 ? (calmCount / totalValid) * 100 : 0;

  // Copy category metadata — no mutation, no extra fields.
  const categories: BeaufortCategory[] = BEAUFORT_CATEGORIES.map((cat) => ({
    beaufort: cat.beaufort,
    label: cat.label,
  }));

  return {
    directions: [...COMPASS_LABELS],
    categories,
    bins,
    totalRecords: totalValid,
    calmPercentage,
  };
}

/**
 * Re-export the default Beaufort color map so ConfigDrivenGroup can pass it
 * to WindRoseChart as the `beaufortColors` prop when no operator override exists.
 */
export { DEFAULT_BEAUFORT_COLORS as defaultBeaufortColors };
