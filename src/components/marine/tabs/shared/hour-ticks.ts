// hour-ticks.ts — shared X-axis tick helper for the 72h marine forecast
// charts (tide/wind/wave). Produces evenly-spaced tick timestamps across a
// [minTs, maxTs] domain so every chart in the marine tabs uses the same
// tick cadence.

/**
 * Builds tick timestamps spaced `stepHours` apart across [minTs, maxTs],
 * aligned to the nearest step boundary at or after minTs.
 */
export function buildHourTicks(minTs: number, maxTs: number, stepHours = 12): number[] {
  const stepMs = stepHours * 3600 * 1000;
  const ticks: number[] = [];
  let t = Math.ceil(minTs / stepMs) * stepMs;
  for (; t <= maxTs; t += stepMs) {
    ticks.push(t);
  }
  if (ticks.length === 0) ticks.push(minTs);
  return ticks;
}
