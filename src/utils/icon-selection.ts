// icon-selection.ts — PoP-gated weather icon selection utility.
//
// The Clear Skies API passes raw weatherCode, cloudCover, and
// precipProbability. This module applies the 20% probability-of-precipitation
// (PoP) threshold (industry standard per NWS practice) to determine whether
// to show a precipitation icon, a sky-condition icon, or (in a future phase)
// a combined sky+precipitation icon.

/**
 * Apply the PoP gate and atmosphere condition logic to select the appropriate
 * weather icon code for display.
 *
 * The API passes raw weatherCode, cloudCover, and precipProbability. This
 * function applies the 20% PoP threshold (industry standard per NWS practice)
 * to determine whether to show a precipitation icon, a sky-condition icon,
 * or a combined sky+precipitation icon.
 */
export function selectWeatherIcon(params: {
  weatherCode: number | null;
  precipProbability: number | null;
  cloudCover: number | null;
  isNight: boolean;
}): { code: number; isNight: boolean } {
  const { weatherCode, precipProbability, cloudCover, isNight } = params;

  // No weather code → clear sky
  if (weatherCode === null || weatherCode === undefined) {
    return { code: 0, isNight };
  }

  // Check if the code indicates precipitation (WMO 51-99 range)
  const isPrecipCode = weatherCode >= 51 && weatherCode <= 99;

  // Check if the code is an atmosphere condition (5=haze, 6=smoke, 7=dust, 8=ash)
  const isAtmosphereCode = weatherCode >= 5 && weatherCode <= 8;

  // Atmosphere conditions: select cloud-cover tier variant
  // (atmosphere codes pass through — the WMO_MAP handles the glyph selection;
  // cloud-cover tier variants will be added in Phase 4 when the glyphs exist)
  if (isAtmosphereCode) {
    return { code: weatherCode, isNight };
  }

  // Non-precipitation codes pass through unchanged
  if (!isPrecipCode) {
    return { code: weatherCode, isNight };
  }

  // --- PoP gate for precipitation codes ---

  const pop = precipProbability ?? 100; // If no PoP data, show the precip icon (conservative)

  // PoP < 20%: suppress precipitation icon, show sky-condition based on cloud cover
  if (pop < 20) {
    return { code: cloudCoverToSkyCode(cloudCover), isNight };
  }

  // PoP >= 20%: show the precipitation icon as-is
  // (Combined sky+precipitation icons for the 20-50% range will be added in Phase 4
  // when the combined glyphs exist. For now, show the precipitation icon.)
  return { code: weatherCode, isNight };
}

/**
 * Map a cloud cover percentage to a sky-condition WMO code.
 * Used when the PoP gate suppresses a precipitation icon.
 */
function cloudCoverToSkyCode(cloudCover: number | null): number {
  if (cloudCover === null || cloudCover === undefined) return 0;
  if (cloudCover < 25) return 0;   // Clear
  if (cloudCover < 50) return 2;   // Partly cloudy
  if (cloudCover < 87) return 3;   // Mostly cloudy / overcast
  return 3;                         // Overcast
}
