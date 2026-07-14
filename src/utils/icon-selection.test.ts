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

  it('suppresses snow code when PoP is 5%', () => {
    const result = selectWeatherIcon({
      weatherCode: 71,  // Snow
      precipProbability: 5,
      cloudCover: 60,
      isNight: false,
    });
    expect(result.code).toBe(3);  // Mostly cloudy/overcast
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
  it('PoP exactly 20% shows precipitation icon', () => {
    const result = selectWeatherIcon({
      weatherCode: 80,
      precipProbability: 20,
      cloudCover: 30,
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

describe('selectWeatherIcon — atmosphere conditions pass through', () => {
  it('haze (code 5) passes through unchanged', () => {
    const result = selectWeatherIcon({
      weatherCode: 5,
      precipProbability: 0,
      cloudCover: 50,
      isNight: false,
    });
    expect(result.code).toBe(5);
  });

  it('smoke (code 6) passes through unchanged', () => {
    const result = selectWeatherIcon({
      weatherCode: 6,
      precipProbability: 0,
      cloudCover: 30,
      isNight: true,
    });
    expect(result.code).toBe(6);
    expect(result.isNight).toBe(true);
  });

  it('dust (code 7) passes through unchanged', () => {
    const result = selectWeatherIcon({
      weatherCode: 7,
      precipProbability: 0,
      cloudCover: 80,
      isNight: false,
    });
    expect(result.code).toBe(7);
  });

  it('volcanic ash (code 8) passes through unchanged', () => {
    const result = selectWeatherIcon({
      weatherCode: 8,
      precipProbability: 10,
      cloudCover: 90,
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

  it('cloud cover 50% → overcast (code 3)', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 5,
      cloudCover: 50,
      isNight: false,
    });
    expect(result.code).toBe(3);
  });

  it('cloud cover 86% → overcast (code 3)', () => {
    const result = selectWeatherIcon({
      weatherCode: 61,
      precipProbability: 5,
      cloudCover: 86,
      isNight: false,
    });
    expect(result.code).toBe(3);
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
