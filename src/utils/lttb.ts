/**
 * lttb.ts — Largest Triangle Three Buckets downsampling
 *
 * Reduces a time-series dataset to a target point count while preserving the
 * visual shape of the data. Points are selected (never copied) — the returned
 * array is a subset of the original input objects, so all fields are preserved.
 *
 * Reference: Sveinn Steinarsson, "Downsampling Time Series for Visual
 * Representation" (2013). https://skemman.is/handle/1946/15343
 */

/**
 * Downsample a time-series dataset using Largest Triangle Three Buckets (LTTB).
 * Preserves visual shape while reducing point count.
 *
 * @param data      - Array of data points (objects with numeric x and y values).
 * @param threshold - Target number of output points. Must be >= 2. If the
 *                    dataset is already at or below threshold, data is returned
 *                    as-is with no allocation.
 * @param xKey      - Key for the x-axis value (e.g. 'dateTime', 'timestamp').
 *                    The value must be numeric (a Unix timestamp in ms/s is fine).
 * @param yKey      - Key for the y-axis value (e.g. 'outTemp'). May be null or
 *                    undefined in the source objects (weather data has gaps).
 * @returns Downsampled array — a subset of the original objects in the original
 *          order. The length is min(data.length, threshold).
 */
export function lttbDownsample<T extends Record<string, unknown>>(
  data: T[],
  threshold: number,
  xKey: string,
  yKey: string,
): T[] {
  // Clamp threshold to a minimum of 2 (algorithm requires first + last).
  const clampedThreshold = Math.max(2, Math.floor(threshold));

  // If data fits within the threshold, return as-is — no allocations.
  if (data.length <= clampedThreshold) return data;

  // Helper: read a numeric x value from a point.
  // All x values are expected to be numeric (timestamps); return 0 on miss.
  const getX = (point: T): number => {
    const v = point[xKey];
    return typeof v === 'number' ? v : Number(v ?? 0);
  };

  // Helper: read a numeric y value from a point.
  // Returns null when the value is absent or non-numeric (data gap).
  const getY = (point: T): number | null => {
    const v = point[yKey];
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  };

  const sampled: T[] = [];

  // Always keep the first point.
  sampled.push(data[0]);

  // Bucket size: split the interior points (excluding first and last) across
  // (threshold - 2) buckets. Each bucket contributes exactly one selected point.
  const bucketSize = (data.length - 2) / (clampedThreshold - 2);

  // Index of the last selected point (used as the triangle's first vertex).
  let a = 0;

  for (let i = 0; i < clampedThreshold - 2; i++) {
    // --- Current bucket boundaries (interior indices, [1 .. data.length - 2]) ---
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(
      Math.floor((i + 2) * bucketSize) + 1,
      data.length - 1,
    );

    // --- Next bucket: compute its average (x, y) as the triangle's third vertex ---
    const nextBucketStart = Math.floor((i + 2) * bucketSize) + 1;
    const nextBucketEnd = Math.min(
      Math.floor((i + 3) * bucketSize) + 1,
      data.length - 1,
    );

    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;

    for (let k = nextBucketStart; k < nextBucketEnd; k++) {
      const y = getY(data[k]);
      if (y === null) continue; // skip null gaps in the average
      avgX += getX(data[k]);
      avgY += y;
      avgCount++;
    }

    if (avgCount > 0) {
      avgX /= avgCount;
      avgY /= avgCount;
    } else {
      // Entire next bucket is null — fall back to the bucket start position
      // so the denominator doesn't remain 0 and area comparison still works.
      avgX = nextBucketStart < data.length ? getX(data[nextBucketStart]) : 0;
      avgY = 0;
    }

    // --- Select the point in the current bucket that maximises triangle area ---
    // Triangle vertices: A = data[a] (prev selected), J = data[j] (candidate),
    // C = (avgX, avgY) (next-bucket average).
    //
    // Area formula (cross-product / 2, absolute value):
    //   |( x_a - x_c ) * ( y_j - y_a ) - ( x_a - x_j ) * ( y_c - y_a )|
    //
    // The 0.5 factor cancels when comparing areas, so we omit it.

    let maxArea = -1;
    let maxIndex = bucketStart;

    const ax = getX(data[a]);
    const ay = getY(data[a]) ?? 0; // treat null prev-point y as 0

    for (let j = bucketStart; j < bucketEnd; j++) {
      const jy = getY(data[j]);
      if (jy === null) continue; // skip null gaps — they can't form a meaningful triangle

      const area = Math.abs(
        (ax - avgX) * (jy - ay) - (ax - getX(data[j])) * (avgY - ay),
      );

      if (area > maxArea) {
        maxArea = area;
        maxIndex = j;
      }
    }

    sampled.push(data[maxIndex]);
    a = maxIndex;
  }

  // Always keep the last point.
  sampled.push(data[data.length - 1]);

  return sampled;
}
