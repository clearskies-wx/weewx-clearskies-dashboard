import { describe, it, expect } from 'vitest';
import { selectWeatherIcon } from './icon-selection';

describe('selectWeatherIcon — PoP gate suppression (PoP < 20%)', () => {
  it('suppresses rain code when PoP is 10%, returns clear sky for low cloud cover', () => {
    const result = selectWeatherIcon({
      weatherCode: 80,  // Rain showers
      precipProbability: 10,
      cloudCover: 15,
      isNight: false,
    });
    expect(result.code).toBe(0);  // Clear sky
    expect(result.isNight).toBe(false);
  });

  it('suppresses rain code when PoP is 10%, returns partly cloudy for moderate cloud cover', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,  // Rain
      precipProbability: 10,
      cloudCover: 35,
      isNight: false,
    });
    expect(result.code).toBe(2);  // Partly cloudy
  });

  it('suppresses rain code when PoP is 10%, returns overcast for high cloud cover', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 10,
      cloudCover: 90,
      isNight: true,
    });
    expect(result.code).toBe(3);  // Overcast
    expect(result.isNight).toBe(true);
  });

  it('suppresses snow code when PoP is 5%, cloud cover 60% falls in the mostly-cloudy tier', () => {
    const result = selectWeatherIcon({
      weatherCode: 71,  // Snow
      precipProbability: 5,
      cloudCover: 60,
      isNight: false,
    });
    // T4.8 split the old 50-86% "overcast" band into a distinct "mostly
    // cloudy" tier (compound code 100); true overcast (3) now starts at 87%.
    expect(result.code).toBe(100);  // Mostly cloudy
  });

  it('thunderstorm (code 95) at PoP 5% is NEVER suppressed — storms always show', () => {
    const result = selectWeatherIcon({
      weatherCode: 95,
      precipProbability: 5,
      cloudCover: 10,
      isNight: false,
    });
    expect(result.code).toBe(95);
  });

  it('thunderstorm with hail (code 99) at PoP 0% is NEVER suppressed', () => {
    const result = selectWeatherIcon({
      weatherCode: 99,
      precipProbability: 0,
      cloudCover: 0,
      isNight: false,
    });
    expect(result.code).toBe(99);
  });

  it('PoP exactly 19% still suppresses (threshold is >= 20)', () => {
    const result = selectWeatherIcon({
      weatherCode: 80,
      precipProbability: 19,
      cloudCover: 10,
      isNight: false,
    });
    expect(result.code).toBe(0);  // Clear
  });
});

describe('selectWeatherIcon — PoP at/above threshold (PoP >= 20%)', () => {
  it('PoP exactly 20% shows precipitation icon (high cloud cover keeps it out of the combined-icon band)', () => {
    const result = selectWeatherIcon({
      weatherCode: 80,
      precipProbability: 20,
      // T4.8 added a combined sky+precip icon (code 101) for PoP 20-50% AND
      // cloud cover < 75%. cloudCover is raised to 80% here so this test
      // isolates the PoP-threshold boundary; the combined-icon band itself
      // is covered by the "combined sky+precipitation" suite below.
      cloudCover: 80,
      isNight: false,
    });
    expect(result.code).toBe(80);  // Rain showers unchanged
  });

  it('PoP 60% shows precipitation icon unchanged', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 60,
      cloudCover: 40,
      isNight: false,
    });
    expect(result.code).toBe(61);  // Rain unchanged
  });

  it('PoP 100% shows precipitation icon', () => {
    const result = selectWeatherIcon({
      weatherCode: 95,
      precipProbability: 100,
      cloudCover: 95,
      isNight: false,
    });
    expect(result.code).toBe(95);  // Thunderstorm
  });
});

describe('selectWeatherIcon — null/missing inputs', () => {
  it('null weatherCode returns clear sky (code 0)', () => {
    const result = selectWeatherIcon({
      weatherCode: null,
      precipProbability: 50,
      cloudCover: 50,
      isNight: false,
    });
    expect(result.code).toBe(0);
  });

  it('null precipProbability defaults to showing precip icon (conservative)', () => {
    const result = selectWeatherIcon({
      weatherCode: 80,
      precipProbability: null,
      cloudCover: 30,
      isNight: false,
    });
    expect(result.code).toBe(80);  // Shows rain (treats null PoP as 100%)
  });

  it('null cloudCover with suppressed PoP returns clear (code 0)', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 5,
      cloudCover: null,
      isNight: false,
    });
    expect(result.code).toBe(0);  // Clear (null cloud cover = 0%)
  });
});

describe('selectWeatherIcon — atmosphere conditions pass through (low cloud cover)', () => {
  // T4.8 added cloud-cover tiers for atmosphere codes (compound codes
  // 104-108) — these codes only "pass through" unchanged at low cloud
  // cover. The tier boundaries themselves are covered by the dedicated
  // "atmosphere condition cloud-cover tiers" suite below.
  it('haze (code 5) passes through unchanged at low cloud cover', () => {
    const result = selectWeatherIcon({
      weatherCode: 5,
      precipProbability: 0,
      cloudCover: 10,
      isNight: false,
    });
    expect(result.code).toBe(5);
  });

  it('smoke (code 6) passes through unchanged at low cloud cover', () => {
    const result = selectWeatherIcon({
      weatherCode: 6,
      precipProbability: 0,
      cloudCover: 10,
      isNight: true,
    });
    expect(result.code).toBe(6);
    expect(result.isNight).toBe(true);
  });

  it('dust (code 7) passes through unchanged at low cloud cover', () => {
    const result = selectWeatherIcon({
      weatherCode: 7,
      precipProbability: 0,
      cloudCover: 10,
      isNight: false,
    });
    expect(result.code).toBe(7);
  });

  it('volcanic ash (code 8) passes through unchanged at low cloud cover', () => {
    const result = selectWeatherIcon({
      weatherCode: 8,
      precipProbability: 10,
      cloudCover: 10,
      isNight: false,
    });
    expect(result.code).toBe(8);
  });
});

describe('selectWeatherIcon — non-precip codes pass through', () => {
  it('clear sky (code 0) passes through', () => {
    const result = selectWeatherIcon({
      weatherCode: 0,
      precipProbability: 0,
      cloudCover: 5,
      isNight: false,
    });
    expect(result.code).toBe(0);
  });

  it('partly cloudy (code 2) passes through', () => {
    const result = selectWeatherIcon({
      weatherCode: 2,
      precipProbability: 10,
      cloudCover: 40,
      isNight: true,
    });
    expect(result.code).toBe(2);
    expect(result.isNight).toBe(true);
  });

  it('fog (code 45) passes through', () => {
    const result = selectWeatherIcon({
      weatherCode: 45,
      precipProbability: 0,
      cloudCover: 100,
      isNight: false,
    });
    expect(result.code).toBe(45);
  });

  it('mist (code 10) passes through', () => {
    const result = selectWeatherIcon({
      weatherCode: 10,
      precipProbability: 0,
      cloudCover: 90,
      isNight: false,
    });
    expect(result.code).toBe(10);
  });
});

describe('selectWeatherIcon — cloud cover fallback tiers', () => {
  it('cloud cover 0% → clear (code 0)', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 5,
      cloudCover: 0,
      isNight: false,
    });
    expect(result.code).toBe(0);
  });

  it('cloud cover 24% → clear (code 0)', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 5,
      cloudCover: 24,
      isNight: false,
    });
    expect(result.code).toBe(0);
  });

  it('cloud cover 25% → partly cloudy (code 2)', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 5,
      cloudCover: 25,
      isNight: false,
    });
    expect(result.code).toBe(2);
  });

  it('cloud cover 49% → partly cloudy (code 2)', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 5,
      cloudCover: 49,
      isNight: false,
    });
    expect(result.code).toBe(2);
  });

  it('cloud cover 50% → mostly cloudy (code 100)', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 5,
      cloudCover: 50,
      isNight: false,
    });
    // T4.8: 50-86% is now the distinct "mostly cloudy" tier (compound code
    // 100), not overcast. True overcast starts at 87% (see next tests).
    expect(result.code).toBe(100);
  });

  it('cloud cover 86% → mostly cloudy (code 100)', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 5,
      cloudCover: 86,
      isNight: false,
    });
    expect(result.code).toBe(100);
  });

  it('cloud cover 87% → overcast (code 3)', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 5,
      cloudCover: 87,
      isNight: false,
    });
    expect(result.code).toBe(3);
  });

  it('cloud cover 100% → overcast (code 3)', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 5,
      cloudCover: 100,
      isNight: false,
    });
    expect(result.code).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// T4.8/T4.10 — compound code coverage: mostly-cloudy tier, combined
// sky+precipitation icons (101-103), and atmosphere condition cloud-cover
// tiers (104-108). See DESIGN-MANUAL §7 cloud-cover x atmosphere-condition
// matrix and icon-selection.ts for the underlying thresholds.
// ---------------------------------------------------------------------------

describe('selectWeatherIcon — mostly cloudy tier (compound code 100)', () => {
  it('cloud cover 60%, PoP 5% (suppressed) → mostly cloudy (code 100), not overcast', () => {
    const result = selectWeatherIcon({
      weatherCode: 80,  // Rain showers, suppressed by the PoP gate
      precipProbability: 5,
      cloudCover: 60,
      isNight: false,
    });
    expect(result.code).toBe(100);
  });

  it('cloud cover 90%, PoP 5% (suppressed) → overcast (code 3)', () => {
    const result = selectWeatherIcon({
      weatherCode: 80,
      precipProbability: 5,
      cloudCover: 90,
      isNight: false,
    });
    expect(result.code).toBe(3);
  });
});

describe('selectWeatherIcon — combined sky+precipitation (PoP 20-50%, cloud cover < 75%)', () => {
  it('rain (code 61) at PoP 30%, cloud cover 40% → combined partly cloudy + rain (code 101)', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 30,
      cloudCover: 40,
      isNight: false,
    });
    expect(result.code).toBe(101);
  });

  it('snow (code 71) at PoP 30%, cloud cover 40% → combined partly cloudy + snow (code 102)', () => {
    const result = selectWeatherIcon({
      weatherCode: 71,
      precipProbability: 30,
      cloudCover: 40,
      isNight: false,
    });
    expect(result.code).toBe(102);
  });

  it('freezing rain (code 66) at PoP 30%, cloud cover 40% → combined partly cloudy + wintry mix (code 103)', () => {
    const result = selectWeatherIcon({
      weatherCode: 66,
      precipProbability: 30,
      cloudCover: 40,
      isNight: false,
    });
    expect(result.code).toBe(103);
  });

  it('thunderstorm (code 95) at PoP 30%, cloud cover 40% → passes through unchanged (no combined variant)', () => {
    const result = selectWeatherIcon({
      weatherCode: 95,
      precipProbability: 30,
      cloudCover: 40,
      isNight: false,
    });
    // Thunderstorm always shows the full glyph regardless of PoP/cloud
    // cover — a storm is never "partly cloudy" (see combinedPrecipCode()).
    expect(result.code).toBe(95);
  });

  it('rain (code 61) at PoP 30%, cloud cover 80% → no combined icon (cloud cover >= 75%)', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 30,
      cloudCover: 80,
      isNight: false,
    });
    expect(result.code).toBe(61);
  });

  it('rain (code 61) at PoP 60%, cloud cover 40% → no combined icon (PoP above the 50% band ceiling)', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 60,
      cloudCover: 40,
      isNight: false,
    });
    expect(result.code).toBe(61);
  });
});

describe('selectWeatherIcon — atmosphere condition cloud-cover tiers', () => {
  it('haze (code 5) at cloud cover 10% stays clear (code 5)', () => {
    const result = selectWeatherIcon({
      weatherCode: 5,
      precipProbability: 0,
      cloudCover: 10,
      isNight: false,
    });
    expect(result.code).toBe(5);
  });

  it('haze (code 5) at cloud cover 35% → haze, partly cloudy (code 104)', () => {
    const result = selectWeatherIcon({
      weatherCode: 5,
      precipProbability: 0,
      cloudCover: 35,
      isNight: false,
    });
    expect(result.code).toBe(104);
  });

  it('haze (code 5) at cloud cover 70% → haze, overcast (code 105)', () => {
    const result = selectWeatherIcon({
      weatherCode: 5,
      precipProbability: 0,
      cloudCover: 70,
      isNight: false,
    });
    expect(result.code).toBe(105);
  });

  it('smoke (code 6) at cloud cover 10% stays clear (code 6)', () => {
    const result = selectWeatherIcon({
      weatherCode: 6,
      precipProbability: 0,
      cloudCover: 10,
      isNight: false,
    });
    expect(result.code).toBe(6);
  });

  it('smoke (code 6) at cloud cover 35% → smoke, partly cloudy (code 106)', () => {
    const result = selectWeatherIcon({
      weatherCode: 6,
      precipProbability: 0,
      cloudCover: 35,
      isNight: false,
    });
    expect(result.code).toBe(106);
  });

  it('smoke (code 6) at cloud cover 70% → smoke, overcast (code 107)', () => {
    const result = selectWeatherIcon({
      weatherCode: 6,
      precipProbability: 0,
      cloudCover: 70,
      isNight: false,
    });
    expect(result.code).toBe(107);
  });

  it('dust (code 7) at cloud cover 30% stays standalone (code 7, below the overcast tier)', () => {
    const result = selectWeatherIcon({
      weatherCode: 7,
      precipProbability: 0,
      cloudCover: 30,
      isNight: false,
    });
    expect(result.code).toBe(7);
  });

  it('dust (code 7) at cloud cover 60% → dust, overcast (code 108)', () => {
    const result = selectWeatherIcon({
      weatherCode: 7,
      precipProbability: 0,
      cloudCover: 60,
      isNight: false,
    });
    expect(result.code).toBe(108);
  });

  it('volcanic ash (code 8) at cloud cover 35% reuses the smoke partly-cloudy tier (code 106)', () => {
    const result = selectWeatherIcon({
      weatherCode: 8,
      precipProbability: 0,
      cloudCover: 35,
      isNight: false,
    });
    expect(result.code).toBe(106);
  });
});
