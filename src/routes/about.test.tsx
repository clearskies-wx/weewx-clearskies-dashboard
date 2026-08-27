// about.test.tsx — M4-DASH (SURF-MAP-BASEMAP, PA9, 2026-08-27), allowlist
// extension (coordinator ruling, this round): the LM-3 (2026-08-04)
// per-marine-location dynamic imagery-provider attribution block (naip/esri
// active-provider attribution, resolved via `useImageryConfig`) was REMOVED
// from about.tsx by M4-DASH-dev — `/imagery/config` now always answers
// `provider: "basemap"` (directive 15: no Esri, no aerial photography, on
// any user-facing surface), so there is no more per-location "active
// provider" to attribute. The product basemap's own attribution
// (OpenStreetMap + Protomaps) is a STATIC entry (`STATIC_PROVIDERS`'
// `baseMaps` domain, about.tsx:25-27) — not derived from any config fetch.
// Confirmed no other user-facing consumer of the old naip/esri fixtures via
// `grep -rn "naip\|esri" src/components src/hooks src/routes` (only the
// wizard/admin toggle remains, out of dashboard scope per directive 15).
//
// The old `NAIP_CONFIG`/`ESRI_CONFIG` fixtures no longer type-check:
// `ImageryConfigResponse.provider`/`.proxyMode` are narrowed to the literal
// types `'basemap'`/`'direct'` (src/api/types.ts:2355,2370) as of this
// round — `provider: 'naip'` is no longer assignable. Replaced with
// as-built assertions below; `useImageryConfig` mocking is removed
// entirely (about.tsx no longer imports that hook — `grep -n
// "useImageryConfig" src/routes/about.tsx` is empty).
//
// Pre-change evidence: the dev's edit to about.tsx (and about.test.tsx)
// landed in the shared working tree before this rewrite could be checked
// against a live 43afaee run (checkout/stash of another agent's
// in-progress work is forbidden — same situation as HeatMapCard.test.tsx
// this round). Per "git show <base>:<file> into scratch" (mandatory-blocks
// git-safety rule), the pre-change source was extracted instead: `git show
// 43afaee:src/routes/about.tsx` (scratch/m4-dash-test-author/about-43afaee.tsx)
// confirms, verbatim:
//   line 14:  import { useImageryConfig } from '../hooks/useImageryConfig';
//   line 125: const { data: imageryConfig } = useImageryConfig(...)
//   line 315: {imageryCredit && ( ... renders a THIRD "Imagery" domain
//             group with imageryCredit.attribution ... )}
// — a per-location dynamic imagery attribution block existed and rendered
// whenever useImageryConfig resolved. `git show 43afaee:src/routes/
// about.test.tsx` (scratch/.../about-test-43afaee.tsx) confirms the OLD
// test asserted this behavior POSITIVELY:
//   `findByText(NAIP_CONFIG.attribution)).toBeDefined()` when
//   useImageryConfig is mocked to a NAIP config with a marine location
//   present.
// Against that exact pre-change code, this round's rewritten test 2 ("no
// dynamic per-location imagery-provider attribution entry renders") would
// have found a THIRD domain group (Imagery) present, making the "exactly
// two entries in the baseMaps group" assertion still pass by coincidence
// (Imagery is a SEPARATE group from baseMaps) but the deeper AS-BUILT claim
// this test exists to pin — "no page anywhere shows a dynamic per-location
// credit" — was FALSE pre-change (an Imagery group with a live
// `imageryConfig.attribution` string DID render there, just not literally
// "USGS National Agriculture Imagery Program" or "Source: Esri" verbatim
// unless a NAIP/ESRI-shaped config was mocked, which this round's fixture
// no longer supplies). Test 1 (STATIC_PROVIDERS baseMaps rows) is not a
// regression guard — STATIC_PROVIDERS existed unchanged before and after
// this round; it pins the row survives the LM-3 block's removal.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { AboutPage } from './about';
import type { CapabilityRegistry, MarineLocationSummary } from '../api/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      (opts && typeof opts.defaultValue === 'string') ? opts.defaultValue : key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

const HOOK_RESULT_NULL = { data: null, units: undefined, loading: false, error: null, refetch: vi.fn() };

let marineLocations: MarineLocationSummary[] | null = [];
let capabilitiesData: CapabilityRegistry | null = null;

vi.mock('../hooks/useWeatherData', () => ({
  useStation: () => HOOK_RESULT_NULL,
  useCapabilities: () => ({ ...HOOK_RESULT_NULL, data: capabilitiesData }),
  useMarineLocations: () => ({ ...HOOK_RESULT_NULL, data: marineLocations }),
}));

vi.mock('../lib/branding-provider', () => ({
  useBranding: () => ({
    siteTitle: '',
    aboutContent: '',
    stationPhotoUrl: '',
    stationPhotoAlt: '',
  }),
}));

// A single real (non-baseMaps-domain) provider — just enough to pass
// about.tsx's `!capabilities || capabilities.providers.length === 0 ->
// null` gate (about.tsx:126) so `groupedProviders` is non-null and
// STATIC_PROVIDERS' entries actually render. Production-shaped: a real
// domain ('earthquakes'), no `attribution` block (about.tsx falls back to
// `{ name: p.providerId, url: '' }` for a provider that declares none —
// exercised here rather than fabricating a full ProviderAttributionData
// object this test doesn't need).
const CAPABILITIES_WITH_ONE_PROVIDER: CapabilityRegistry = {
  providers: [
    {
      providerId: 'usgs-earthquakes',
      domain: 'earthquakes',
      suppliedCanonicalFields: [],
      geographicCoverage: 'global',
      operatorNotes: null,
      tileUrlTemplate: null,
      wmsEndpointUrl: null,
      wmsLayerName: null,
      tileContentType: null,
      iframeUrl: null,
    },
  ],
  weewxColumns: [],
  canonicalFieldsAvailable: [],
};

const MARINE_LOCATION: MarineLocationSummary = {
  locationId: 'spot-1',
  name: 'Test Beach',
  coordinates: { lat: 34.0, lon: -119.5 },
  activities: [],
  currentConditions: null,
  currentTide: null,
  activeAlerts: null,
  surfRating: null,
  beachSafetyLevel: null,
  weatherCode: null,
  isDay: null,
};

beforeEach(() => {
  marineLocations = [];
  capabilitiesData = null;
  // /marine-photos.json — 404, feature absent. Matches the existing
  // marine-photo-credits resilience path (about.tsx:97-102); not under test
  // here.
  global.fetch = vi.fn().mockResolvedValue({ ok: false });
});

describe('AboutPage — basemap attribution is static, not per-location dynamic (M4-DASH, LM-3 block removed)', () => {
  it('OpenStreetMap + Protomaps rows render from STATIC_PROVIDERS, unconditionally — not derived from any imagery config fetch or marine location', () => {
    capabilitiesData = CAPABILITIES_WITH_ONE_PROVIDER;
    marineLocations = [MARINE_LOCATION]; // present, but no longer wired to any imagery attribution path

    const { getByRole } = render(<AboutPage />);

    const osmLink = getByRole('link', { name: 'OpenStreetMap' });
    expect(osmLink.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright');
    const protomapsLink = getByRole('link', { name: 'Protomaps' });
    expect(protomapsLink.getAttribute('href')).toBe('https://protomaps.com');
  });

  it('no dynamic per-location imagery-provider attribution entry renders, with or without a marine location present (the LM-3 block is gone, not merely inactive)', () => {
    capabilitiesData = CAPABILITIES_WITH_ONE_PROVIDER;
    marineLocations = [MARINE_LOCATION];

    const { container, queryByText } = render(<AboutPage />);

    // The two retired provider strings never appear anywhere on the page.
    expect(queryByText(/USGS National Agriculture Imagery Program/)).toBeNull();
    expect(queryByText(/^Source: Esri/)).toBeNull();

    // The pre-M4 block rendered a SEPARATE "Imagery" <h3> heading (about.tsx
    // at 43afaee, line 321: `t('dataProviders.domain.imagery', {
    // defaultValue: 'Imagery' })`) outside the STATIC_PROVIDERS-driven <dl>
    // entirely — the real regression this test guards is THAT heading
    // never appearing again, not merely the two retired attribution
    // strings being absent.
    expect(queryByText('Imagery')).toBeNull();

    // The `baseMaps` domain group has EXACTLY the two static entries — no
    // third, per-location entry was appended (the pre-M4 behavior this
    // block used to add via `useImageryConfig`).
    const osmLink = container.querySelector('a[href="https://www.openstreetmap.org/copyright"]');
    const protomapsLink = container.querySelector('a[href="https://protomaps.com"]');
    expect(osmLink).not.toBeNull();
    expect(protomapsLink).not.toBeNull();
    const baseMapsGroup = osmLink!.closest('div.mb-3');
    expect(baseMapsGroup).not.toBeNull();
    expect(baseMapsGroup!.querySelectorAll('dd > div')).toHaveLength(2);
  });
});
