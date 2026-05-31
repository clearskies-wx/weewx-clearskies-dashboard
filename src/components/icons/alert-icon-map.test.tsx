/**
 * alert-icon-map.test.tsx — Coverage for the 13-type alert icon map (ADR-050).
 *
 * Verifies:
 *   1. All 13 canonical alert categories resolve from representative NWS event strings.
 *   2. AlertIcon renders the correct SVG for each representative event (smoke test).
 *   3. Unmatched event strings fall back to the 'warning' category.
 *   4. Matching is case-insensitive (NWS titles are mixed-case).
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
// getAlertCategory lives in alert-category.ts (pure function, no JSX).
// AlertIcon lives in alert-icon-map.tsx (component).
import { getAlertCategory } from './alert-category';
import { AlertIcon } from './alert-icon-map';

// ---------------------------------------------------------------------------
// Canonical type → representative NWS event string
// ---------------------------------------------------------------------------

// All 13 ADR-050 categories + representative NWS event strings.
const CANONICAL_CASES: [string, string, string][] = [
  // [description, representative NWS event string, expected category]
  ['fire — Red Flag Warning',            'Red Flag Warning',            'fire'],
  ['fire — Fire Weather Watch',          'Fire Weather Watch',          'fire'],
  ['fire — Wildfire Warning',            'Wildfire Warning',            'fire'],
  ['hurricane — Hurricane Warning',      'Hurricane Warning',           'hurricane'],
  ['hurricane — Tropical Storm Watch',   'Tropical Storm Watch',        'hurricane'],
  ['hurricane — Typhoon Warning',        'Typhoon Warning',             'hurricane'],
  ['thunderstorm — Severe Thunderstorm', 'Severe Thunderstorm Warning', 'thunderstorm'],
  ['thunderstorm — Lightning Advisory',  'Lightning Advisory',          'thunderstorm'],
  ['tornado — Tornado Warning',          'Tornado Warning',             'tornado'],
  ['tornado — Tornado Watch',            'Tornado Watch',               'tornado'],
  ['snow — Winter Storm Warning',        'Winter Storm Warning',        'snow'],
  ['snow — Blizzard Warning',            'Blizzard Warning',            'snow'],
  ['snow — Freeze Warning',              'Freeze Warning',              'snow'],
  ['snow — Ice Storm Warning',           'Ice Storm Warning',           'snow'],
  ['snow — Frost Advisory',              'Frost Advisory',              'snow'],
  ['heat — Excessive Heat Warning',      'Excessive Heat Warning',      'heat'],
  ['heat — Heat Advisory',               'Heat Advisory',               'heat'],
  ['heat — Wind Chill Warning',          'Wind Chill Warning',          'heat'],
  ['heat — Extreme Cold Advisory',       'Extreme Cold Advisory',       'heat'],
  ['fog — Dense Fog Advisory',           'Dense Fog Advisory',          'fog'],
  ['fog — Smoke Advisory',               'Air Quality: Smoke Advisory', 'fog'],
  ['wind — High Wind Warning',           'High Wind Warning',           'wind'],
  ['wind — Wind Advisory',               'Wind Advisory',               'wind'],
  ['marine — Marine Statement',          'Marine Weather Statement',    'marine'],
  ['marine — Small Craft Advisory',      'Small Craft Advisory',        'marine'],
  ['marine — Gale Warning',              'Gale Warning',                'marine'],
  ['marine — Rip Current',               'Rip Current Statement',       'marine'],
  ['flood — Flash Flood Warning',        'Flash Flood Warning',         'flood'],
  ['flood — Flood Watch',                'Flood Watch',                 'flood'],
  ['flood — Coastal Flood Advisory',     'Coastal Flood Advisory',      'flood'],
  ['tsunami — Tsunami Warning',          'Tsunami Warning',             'tsunami'],
  ['tsunami — Tsunami Watch',            'Tsunami Watch',               'tsunami'],
  // Generic watch (no more-specific subtype)
  ['watch — Beach Hazards Watch',        'Beach Hazards Watch',         'watch'],
  // Generic warning (catch-all)
  ['warning — Special Marine Warning',   'Special Marine Warning',      'marine'],  // marine wins first
];

// ---------------------------------------------------------------------------
// Suite: all 13 categories are reachable
// ---------------------------------------------------------------------------

describe('getAlertCategory — canonical type classification', () => {
  it.each(CANONICAL_CASES)(
    '%s',
    (_label, event, expectedCategory) => {
      expect(getAlertCategory(event)).toBe(expectedCategory);
    },
  );
});

// ---------------------------------------------------------------------------
// Suite: case-insensitive matching
// ---------------------------------------------------------------------------

describe('getAlertCategory — case insensitivity', () => {
  it('"TORNADO WARNING" (all-caps) → tornado', () => {
    expect(getAlertCategory('TORNADO WARNING')).toBe('tornado');
  });

  it('"tornado warning" (lower) → tornado', () => {
    expect(getAlertCategory('tornado warning')).toBe('tornado');
  });

  it('"Flash Flood Warning" → flood', () => {
    expect(getAlertCategory('Flash Flood Warning')).toBe('flood');
  });

  it('"TSUNAMI WATCH" → tsunami', () => {
    expect(getAlertCategory('TSUNAMI WATCH')).toBe('tsunami');
  });
});

// ---------------------------------------------------------------------------
// Suite: fallback for unrecognised event strings
// ---------------------------------------------------------------------------

describe('getAlertCategory — fallback', () => {
  it('empty string → warning (generic fallback)', () => {
    expect(getAlertCategory('')).toBe('warning');
  });

  it('"Obscure Rare Event" → warning (generic fallback)', () => {
    expect(getAlertCategory('Obscure Rare Event')).toBe('warning');
  });

  it('"Special Weather Statement" → warning (no subtype match)', () => {
    expect(getAlertCategory('Special Weather Statement')).toBe('warning');
  });
});

// ---------------------------------------------------------------------------
// Suite: AlertIcon renders an SVG element for every category
// ---------------------------------------------------------------------------

// One representative event per category (covers all 13 + default)
const RENDER_CASES: [string, string][] = [
  ['fire',         'Red Flag Warning'],
  ['hurricane',    'Hurricane Warning'],
  ['thunderstorm', 'Severe Thunderstorm Warning'],
  ['tornado',      'Tornado Warning'],
  ['snow',         'Winter Storm Warning'],
  ['heat',         'Excessive Heat Warning'],
  ['fog',          'Dense Fog Advisory'],
  ['wind',         'High Wind Warning'],
  ['marine',       'Small Craft Advisory'],
  ['flood',        'Flash Flood Warning'],
  ['tsunami',      'Tsunami Warning'],
  ['watch',        'Beach Hazards Watch'],
  ['warning',      'Special Weather Statement'],
];

describe('AlertIcon — renders an SVG for all 13 categories', () => {
  it.each(RENDER_CASES)(
    'category %s ("%s") renders an <svg> element',
    (_category, event) => {
      const { container } = render(<AlertIcon event={event} />);
      const svg = container.querySelector('svg');
      expect(svg, `${event} must render an <svg>`).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// Suite: cross-pack icons (Flood, Tsunami) render correctly
// ---------------------------------------------------------------------------

describe('AlertIcon — cross-pack icons render as SVG', () => {
  it('Flash Flood Warning → Flood icon (material-symbols:flood-outline-rounded)', () => {
    const { container } = render(<AlertIcon event="Flash Flood Warning" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // Flood uses Material Symbols viewBox
    expect(svg!.getAttribute('viewBox')).toBe('0 -960 960 960');
  });

  it('Tsunami Warning → Tsunami icon (mdi:tsunami)', () => {
    const { container } = render(<AlertIcon event="Tsunami Warning" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // Tsunami uses standard 24×24 viewBox
    expect(svg!.getAttribute('viewBox')).toBe('0 0 24 24');
  });
});

// ---------------------------------------------------------------------------
// Suite: unmatched events render the fallback Warning icon
// ---------------------------------------------------------------------------

describe('AlertIcon — fallback renders without crashing', () => {
  it('unknown event renders an element', () => {
    const { container } = render(<AlertIcon event="Unknown Event XYZ" />);
    expect(container.firstChild).not.toBeNull();
  });

  it('empty event string renders an element', () => {
    const { container } = render(<AlertIcon event="" />);
    expect(container.firstChild).not.toBeNull();
  });
});
