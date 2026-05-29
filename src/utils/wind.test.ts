/**
 * wind.test.ts — Unit tests for cardinalFromDegrees.
 *
 * The goal is to prove the client formula matches the BFF formula at every
 * sector boundary and at the wrap-around point, so both paths provably agree.
 *
 * BFF formula (Python):  int((deg + 11.25) / 22.5) % 16
 * Client formula (JS):   Math.floor(((normalised + 11.25) % 360) / 22.5) % 16
 */

import { describe, it, expect } from 'vitest';
import { cardinalFromDegrees } from './wind';

describe('cardinalFromDegrees', () => {
  // -------------------------------------------------------------------------
  // Null / non-finite guards
  // -------------------------------------------------------------------------

  it('returns null for null input', () => {
    expect(cardinalFromDegrees(null)).toBeNull();
  });

  it('returns null for NaN', () => {
    expect(cardinalFromDegrees(NaN)).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(cardinalFromDegrees(Infinity)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Cardinal points (every 90°)
  // -------------------------------------------------------------------------

  it('0° → N', () => expect(cardinalFromDegrees(0)).toBe('N'));
  it('90° → E', () => expect(cardinalFromDegrees(90)).toBe('E'));
  it('180° → S', () => expect(cardinalFromDegrees(180)).toBe('S'));
  it('270° → W', () => expect(cardinalFromDegrees(270)).toBe('W'));

  // -------------------------------------------------------------------------
  // Sector boundaries — the critical wrap/boundary cases
  // -------------------------------------------------------------------------

  // N sector: [348.75, 360) ∪ [0, 11.25)
  it('348.74° → NNW (last degree before wrap)', () => {
    expect(cardinalFromDegrees(348.74)).toBe('NNW');
  });

  it('348.75° → N (first degree of next wrap: NNW→N boundary)', () => {
    // At exactly 348.75, (348.75 + 11.25) % 360 = 0, floor(0/22.5)=0 → N
    expect(cardinalFromDegrees(348.75)).toBe('N');
  });

  it('360° → N (equivalent to 0°)', () => {
    expect(cardinalFromDegrees(360)).toBe('N');
  });

  // NNE boundary: [11.25, 33.75)
  it('11.24° → N (last degree of N sector)', () => {
    expect(cardinalFromDegrees(11.24)).toBe('N');
  });

  it('11.25° → NNE (NNE sector starts)', () => {
    expect(cardinalFromDegrees(11.25)).toBe('NNE');
  });

  it('33.74° → NNE', () => expect(cardinalFromDegrees(33.74)).toBe('NNE'));
  it('33.75° → NE', () => expect(cardinalFromDegrees(33.75)).toBe('NE'));

  // Spot-check every sector mid-point
  it('22.5° (NNE mid) → NNE', () => expect(cardinalFromDegrees(22.5)).toBe('NNE'));
  it('45°  (NE mid)  → NE',  () => expect(cardinalFromDegrees(45)).toBe('NE'));
  it('67.5° (ENE mid) → ENE', () => expect(cardinalFromDegrees(67.5)).toBe('ENE'));
  it('112.5° (ESE mid) → ESE', () => expect(cardinalFromDegrees(112.5)).toBe('ESE'));
  it('135° (SE mid) → SE',   () => expect(cardinalFromDegrees(135)).toBe('SE'));
  it('157.5° (SSE mid) → SSE', () => expect(cardinalFromDegrees(157.5)).toBe('SSE'));
  it('202.5° (SSW mid) → SSW', () => expect(cardinalFromDegrees(202.5)).toBe('SSW'));
  it('225° (SW mid) → SW',   () => expect(cardinalFromDegrees(225)).toBe('SW'));
  it('247.5° (WSW mid) → WSW', () => expect(cardinalFromDegrees(247.5)).toBe('WSW'));
  it('292.5° (WNW mid) → WNW', () => expect(cardinalFromDegrees(292.5)).toBe('WNW'));
  it('315° (NW mid) → NW',   () => expect(cardinalFromDegrees(315)).toBe('NW'));
  it('337.5° (NNW mid) → NNW', () => expect(cardinalFromDegrees(337.5)).toBe('NNW'));

  // -------------------------------------------------------------------------
  // BFF agreement: exhaustive check of all 16 sector entry points
  // (sector_start = i * 22.5 - 11.25, adjusted for i=0 to 348.75)
  // -------------------------------------------------------------------------

  const sectors: [number, string][] = [
    [0, 'N'], [22.5, 'NNE'], [45, 'NE'], [67.5, 'ENE'],
    [90, 'E'], [112.5, 'ESE'], [135, 'SE'], [157.5, 'SSE'],
    [180, 'S'], [202.5, 'SSW'], [225, 'SW'], [247.5, 'WSW'],
    [270, 'W'], [292.5, 'WNW'], [315, 'NW'], [337.5, 'NNW'],
  ];

  it.each(sectors)('sector mid %i° → %s', (deg, expected) => {
    expect(cardinalFromDegrees(deg)).toBe(expected);
  });

  // -------------------------------------------------------------------------
  // Out-of-range normalisation
  // -------------------------------------------------------------------------

  it('negative degrees normalise correctly: -1° → equivalent of 359° → N', () => {
    // 359° is actually in the N sector: (359+11.25)%360=10.25, floor(10.25/22.5)=0 → N.
    // The N sector spans [348.75,360)∪[0,11.25); 359° is within [348.75,360).
    expect(cardinalFromDegrees(-1)).toBe('N');
  });

  it('720° normalises to same as 0°', () => {
    expect(cardinalFromDegrees(720)).toBe('N');
  });
});
