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

  // Atmosphere conditions: select the cloud-cover tier variant (internal
  // compound codes 104-108 in WMO_MAP; see weather-icon.tsx).
  if (isAtmosphereCode) {
    return { code: atmosphereCodeForCloudCover(weatherCode, cloudCover), isNight };
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

  // PoP 20-50% AND cloud cover < 75%: combined sky+precipitation icon
  // (internal compound codes 101-103). Thunderstorm codes (95-99) always
  // show the full thunderstorm glyph — sky context is dropped regardless
  // of PoP/cloud cover, since a storm is never "partly cloudy."
  const cover = cloudCover ?? 100;
  if (pop <= 50 && cover < 75) {
    const combined = combinedPrecipCode(weatherCode);
    if (combined !== null) {
      return { code: combined, isNight };
    }
  }

  // PoP > 50%, cloud cover >= 75%, or a code with no combined variant
  // (thunderstorm): show the precipitation icon as-is.
  return { code: weatherCode, isNight };
}

/**
 * Map a cloud cover percentage to a sky-condition WMO code.
 * Used when the PoP gate suppresses a precipitation icon.
 */
function cloudCoverToSkyCode(cloudCover: number | null): number {
  if (cloudCover === null || cloudCover === undefined) return 0;
  if (cloudCover < 25) return 0;    // Clear
  if (cloudCover < 50) return 2;    // Partly cloudy
  if (cloudCover < 87) return 100;  // Mostly cloudy (internal compound code)
  return 3;                          // Overcast
}

/**
 * Map a precipitation WMO code to its internal compound "partly cloudy +
 * precipitation" code (101-103) for the combined sky+precipitation tier.
 * Returns null for codes with no combined variant (thunderstorm — always
 * shown full per DESIGN-MANUAL §7).
 */
function combinedPrecipCode(weatherCode: number): number | null {
  // Rain — drizzle, rain, rain showers
  if (
    (weatherCode >= 51 && weatherCode <= 55) ||
    (weatherCode >= 61 && weatherCode <= 65) ||
    (weatherCode >= 80 && weatherCode <= 82)
  ) {
    return 101;
  }
  // Snow — snow, snow grains, snow showers
  if (
    (weatherCode >= 71 && weatherCode <= 77) ||
    weatherCode === 85 ||
    weatherCode === 86
  ) {
    return 102;
  }
  // Wintry mix — freezing drizzle, freezing rain, ice pellets/sleet
  if (
    weatherCode === 56 ||
    weatherCode === 57 ||
    weatherCode === 66 ||
    weatherCode === 67 ||
    weatherCode === 79
  ) {
    return 103;
  }
  // Thunderstorm (95-99) and anything else: no combined variant
  return null;
}

/**
 * Select the cloud-cover tier variant for an atmosphere condition code
 * (5=haze, 6=smoke, 7=dust, 8=volcanic ash).
 *
 * Volcanic ash (8) reuses the smoke tiers — ash stays suspended in the
 * atmosphere like smoke (DESIGN-MANUAL §7).
 */
function atmosphereCodeForCloudCover(weatherCode: number, cloudCover: number | null): number {
  const cover = cloudCover ?? 0;

  if (weatherCode === 5) {
    // Haze
    if (cover < 25) return 5;    // Haze, clear (existing day/night glyphs)
    if (cover < 50) return 104;  // Haze, partly cloudy
    return 105;                   // Haze, overcast
  }

  if (weatherCode === 6 || weatherCode === 8) {
    // Smoke, or volcanic ash (reuses smoke tiers)
    if (cover < 25) return weatherCode; // Smoke/ash, clear (existing day/night glyphs)
    if (cover < 50) return 106;          // Smoke, partly cloudy
    return 107;                           // Smoke, overcast
  }

  if (weatherCode === 7) {
    // Dust — no distinct "partly cloudy" tier (standalone technique)
    if (cover < 50) return 7;   // Dust, clear/partly cloudy (existing day/night glyphs)
    return 108;                  // Dust, overcast
  }

  return weatherCode;
}
