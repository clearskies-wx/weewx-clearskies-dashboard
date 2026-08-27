// LocationMap.test.tsx — M3 (MARINE-PAGE-FIXIT-PLAN-2026-08-10 §PHASE M)
// + CS-BASEMAP (MARINE-AND-MAPS-PLAN-2026-08-27 §M1).
//
// Covers M1-fixit (tile-error banner + retry) and M2 (theme-keyed
// MapContainer atomic remount) — the fix for fixit log Item 6 ("main map
// sometimes missing layers"): silent gray becomes impossible (tiles or
// banner, never neither), and a theme flip can no longer strand the label
// layer without its base layer. Also covers CS-BASEMAP (2026-08-27 round):
// the CARTO dark base + CARTO `light_only_labels` overlay are replaced by
// the product basemap (`ProtomapsLayer` from `src/lib/basemap.ts`) — dark
// theme gets a two-tier (world+local) `ProtomapsLayer mode="dark-base"`
// stack and no CARTO `TileLayer` at all; light theme keeps the OSM raster
// `TileLayer` but the label overlay becomes `ProtomapsLayer mode="labels"`
// (both tiers) instead of a second CARTO `TileLayer`.
//
// STALE ASSERTIONS UPDATED IN THIS ROUND (per the brief's pre-identification
// that the CARTO label-overlay assertions are stale-by-design):
//   1. "shows the banner when the label overlay layer errors, independent of
//      the base layer" — REMOVED. The label overlay is no longer a raster
//      TileLayer with `tileerror`/`tileload` DOM events; it is now
//      ProtomapsLayer (a PMTiles vector layer with no such events). The plan
//      states `useTileErrorRecovery` "stays on the light OSM layer only" —
//      the dedicated label-layer error-recovery hook (`labelTileRecovery`)
//      is removed from the implementation, so there is nothing left to fire
//      `tileerror` against for the label layer. (Availability for the
//      ProtomapsLayer path is signalled by `useBasemapStatus()` instead, per
//      the plan — not in this test file's assigned scope.)
//   2. "remounts the whole MapContainer... when resolvedTheme changes" — the
//      dark-theme assertion `tileLayerHandlersByUrl.has(DARK_BASE_URL)`
//      (CARTO `dark_all` TileLayer) is REPLACED by an assertion that
//      `ProtomapsLayer` was invoked for both the `world` and `local` tiers
//      and that no `TileLayer` renders at all in dark theme — dark theme no
//      longer has any CARTO/raster base tile.
//
// react-leaflet is mocked at the module level: real Leaflet needs actual
// DOM tile loading/measurement that jsdom doesn't provide, and this file
// only needs to exercise LocationMap's own event-handler wiring and its
// MapContainer key prop — not Leaflet's internals. `../../lib/basemap` is
// mocked the same way, for the same reason (ProtomapsLayer needs a real
// PMTiles/Canvas render pipeline jsdom doesn't provide) — this file only
// needs to exercise which tiers/modes LocationMap asks for, not the product
// basemap's own rendering, which is covered by src/lib/basemap.test.ts.
//
// Pre-change failure transcript (run at HEAD 125b642 — LocationMap.tsx still
// imports CARTO_OSM_ATTRIBUTION from map-attribution.ts, which does not yet
// export PROTOMAPS_OSM_ATTRIBUTION, and does not yet render ProtomapsLayer
// at all):
//
//   $ npx vitest run src/components/marine/LocationMap.test.tsx
//   ❯ src/components/marine/LocationMap.test.tsx (8 tests | 4 failed) 63ms
//     ✓ LocationMap — M1 tile-error banner > does not show the banner before 3 consecutive tileerror events
//     ✓ LocationMap — M1 tile-error banner > shows the banner after 3 consecutive tileerror events on a layer
//     ✓ LocationMap — M1 tile-error banner > clears the banner on the next successful tileload
//     × LocationMap — M2 atomic theme remount > remounts the whole MapContainer (not just the base layer) when resolvedTheme changes
//       → expected [] to include 'world'
//     ✓ LocationMap — M2 atomic theme remount > does not remount MapContainer for an unrelated prop change (same theme)
//     × LocationMap — CS-BASEMAP (M1) dark theme > renders the world+local ProtomapsLayer pair and no CARTO/raster TileLayer
//       → expected [] to include 'world'
//     × LocationMap — CS-BASEMAP (M1) light theme > renders exactly one OSM TileLayer plus the world+local labels ProtomapsLayer pair
//       → expected [ <div …(2)></div>, <div …(2)></div> ] to have a length of 1 but got 2
//       (the CURRENT code renders 2 TileLayers in light theme: OSM base +
//       the CARTO light_only_labels overlay — this is the exact regression
//       this guard is watching for)
//     × map-attribution.ts — PROTOMAPS_OSM_ATTRIBUTION > contains "Protomaps"
//       → the given combination of arguments (undefined and string) is invalid
//       for this assertion (PROTOMAPS_OSM_ATTRIBUTION does not exist yet)
//   Test Files  1 failed (1)
//        Tests  4 failed | 4 passed (8)
//
// The 4 kept M1-fixit/M2 tests unaffected by CS-BASEMAP (base-layer tile
// error/retry/remount-count, all against the LIGHT OSM TileLayer, which is
// unchanged by this round) still pass at HEAD, as expected.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { render, screen, within, act } from '@testing-library/react';
import { LocationMap } from './LocationMap';
import { PROTOMAPS_OSM_ATTRIBUTION } from '../../lib/map-attribution';
import type { MarineLocationSummary } from '../../api/types';
import type { LeafletEventHandlerFnMap } from 'leaflet';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

// Side-effect-only in the real component (leaflet-setup mutates the default
// Leaflet marker icon); irrelevant once react-leaflet itself is mocked.
vi.mock('../../lib/leaflet-setup', () => ({}));

const mockUseTheme = vi.fn();
vi.mock('../../lib/theme-provider', () => ({
  useTheme: (...args: unknown[]) => mockUseTheme(...args),
}));

// ---------------------------------------------------------------------------
// react-leaflet mock. `vi.hoisted` because vi.mock factories are hoisted
// above normal top-level code — the registries the factory closes over must
// be created the same way.
// ---------------------------------------------------------------------------
const { tileLayerHandlersByUrl, mapContainerMountSpy, protomapsLayerCalls } = vi.hoisted(() => ({
  tileLayerHandlersByUrl: new Map<string, LeafletEventHandlerFnMap | undefined>(),
  mapContainerMountSpy: vi.fn(),
  // Records every ProtomapsLayer invocation's props (CS-BASEMAP, M1) so
  // tests can assert which tier(s)/mode(s) LocationMap asked for, without
  // needing a real PMTiles/Canvas render pipeline (jsdom doesn't provide
  // one — same reason react-leaflet itself is mocked below).
  protomapsLayerCalls: [] as Record<string, unknown>[],
}));

vi.mock('react-leaflet', () => {
  const MapContainer = (props: Record<string, unknown>) => {
    // Empty-deps effect: fires once per actual mount. Since LocationMap
    // keys this component on resolvedTheme (M2), a theme change forces
    // React to unmount the old instance and mount a fresh one — this spy
    // call count is the observable proxy for "the whole map remounted."
    useEffect(() => {
      mapContainerMountSpy();
    }, []);
    return (
      <div data-testid="map-container">
        {props.children as React.ReactNode}
      </div>
    );
  };

  const TileLayer = forwardRef<{ redraw: () => void }, Record<string, unknown>>(
    (props, ref) => {
      useImperativeHandle(ref, () => ({ redraw: vi.fn() }));
      const url = props.url as string;
      tileLayerHandlersByUrl.set(url, props.eventHandlers as LeafletEventHandlerFnMap | undefined);
      return <div data-testid="tile-layer" data-url={url} />;
    },
  );
  TileLayer.displayName = 'MockTileLayer';

  const Marker = (props: { children?: React.ReactNode }) => (
    <div data-testid="marker">{props.children}</div>
  );
  const Popup = (props: { children?: React.ReactNode }) => <>{props.children}</>;

  return { MapContainer, TileLayer, Marker, Popup };
});

// ---------------------------------------------------------------------------
// src/lib/basemap.ts mock (CS-BASEMAP, M1) — ProtomapsLayer needs a real
// PMTiles source + Canvas renderer jsdom doesn't provide, so it's mocked the
// same way TileLayer is above. BASEMAP_TIERS/useBasemapStatus are stubbed
// minimally: this file only needs LocationMap to see "every tier available"
// so its own rendering logic (not the product basemap's) is what's under
// test — src/lib/basemap.test.ts covers the real rule/tier contract.
// ---------------------------------------------------------------------------
vi.mock('../../lib/basemap', () => {
  const ProtomapsLayer = (props: Record<string, unknown>) => {
    protomapsLayerCalls.push(props);
    return (
      <div
        data-testid="protomaps-layer"
        data-tier={props.tier as string}
        data-mode={props.mode as string}
      />
    );
  };

  const BASEMAP_TIERS = {
    world: { minZoom: 0, maxZoom: 6, url: '/api/v1/basemap/world/tiles' },
    local: { minZoom: 7, maxZoom: 15, url: '/api/v1/basemap/local/tiles' },
    radar: { minZoom: 0, maxZoom: 12, url: '/api/v1/basemap/radar/tiles' },
  };

  const useBasemapStatus = () => ({
    data: {
      world: { available: true },
      local: { available: true },
      radar: { available: true },
      updating: false,
      lastError: null,
    },
    loading: false,
    error: null,
  });

  return { ProtomapsLayer, BASEMAP_TIERS, useBasemapStatus };
});

const LOCATIONS: MarineLocationSummary[] = [
  {
    locationId: 'huntington-city-beach-pier',
    name: 'Huntington City Beach Pier',
    coordinates: { lat: 33.655, lon: -118.0 },
    activities: ['surfing'],
    currentConditions: null,
    currentTide: null,
    activeAlerts: null,
    surfRating: null,
    beachSafetyLevel: null,
    weatherCode: null,
    isDay: null,
  },
];

function fireTileError(url: string) {
  const handlers = tileLayerHandlersByUrl.get(url);
  act(() => {
    handlers?.tileerror?.({} as never);
  });
}

function fireTileLoad(url: string) {
  const handlers = tileLayerHandlersByUrl.get(url);
  act(() => {
    handlers?.tileload?.({} as never);
  });
}

// Same URL as TILE_CONFIG.light in LocationMap.tsx — the only TileLayer left
// after CS-BASEMAP (M1): dark base + the label overlay are both
// ProtomapsLayer now (see protomapsLayerCalls), never a CARTO TileLayer.
const LIGHT_BASE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

beforeEach(() => {
  tileLayerHandlersByUrl.clear();
  mapContainerMountSpy.mockClear();
  protomapsLayerCalls.length = 0;
  mockUseTheme.mockReturnValue({ resolved: 'light' });
});

describe('LocationMap — M1 tile-error banner', () => {
  it('does not show the banner before 3 consecutive tileerror events', () => {
    render(
      <LocationMap
        locations={LOCATIONS}
        selectedId={null}
        onSelectLocation={vi.fn()}
        variant="full"
      />,
    );

    fireTileError(LIGHT_BASE_URL);
    fireTileError(LIGHT_BASE_URL);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the banner after 3 consecutive tileerror events on a layer', () => {
    render(
      <LocationMap
        locations={LOCATIONS}
        selectedId={null}
        onSelectLocation={vi.fn()}
        variant="full"
      />,
    );

    fireTileError(LIGHT_BASE_URL);
    fireTileError(LIGHT_BASE_URL);
    fireTileError(LIGHT_BASE_URL);

    const banner = screen.getByRole('status');
    expect(within(banner).getByText('map.tileError')).not.toBeNull();
  });

  it('clears the banner on the next successful tileload', () => {
    render(
      <LocationMap
        locations={LOCATIONS}
        selectedId={null}
        onSelectLocation={vi.fn()}
        variant="full"
      />,
    );

    fireTileError(LIGHT_BASE_URL);
    fireTileError(LIGHT_BASE_URL);
    fireTileError(LIGHT_BASE_URL);
    expect(screen.getByRole('status')).not.toBeNull();

    fireTileLoad(LIGHT_BASE_URL);
    expect(screen.queryByRole('status')).toBeNull();
  });

  // "shows the banner when the label overlay layer errors, independent of
  // the base layer" — REMOVED (CS-BASEMAP, M1). The label overlay is no
  // longer a raster TileLayer with tileerror/tileload DOM events; it is now
  // ProtomapsLayer (a PMTiles vector layer, no such events). See the file
  // header comment "STALE ASSERTIONS UPDATED IN THIS ROUND" item 1.
});

describe('LocationMap — M2 atomic theme remount', () => {
  it('remounts the whole MapContainer (not just the base layer) when resolvedTheme changes', () => {
    mockUseTheme.mockReturnValue({ resolved: 'light' });
    const { rerender } = render(
      <LocationMap
        locations={LOCATIONS}
        selectedId={null}
        onSelectLocation={vi.fn()}
        variant="full"
      />,
    );

    expect(mapContainerMountSpy).toHaveBeenCalledTimes(1);
    expect(tileLayerHandlersByUrl.has(LIGHT_BASE_URL)).toBe(true);

    mockUseTheme.mockReturnValue({ resolved: 'dark' });
    rerender(
      <LocationMap
        locations={LOCATIONS}
        selectedId={null}
        onSelectLocation={vi.fn()}
        variant="full"
      />,
    );

    // A fresh MapContainer instance mounted (React's key-based remount, M2)
    // rather than the same instance updating in place.
    expect(mapContainerMountSpy).toHaveBeenCalledTimes(2);
    // CS-BASEMAP (M1): dark theme has no CARTO/raster base TileLayer at all
    // — it renders the world+local ProtomapsLayer pair instead (item 2 of
    // the file header's "STALE ASSERTIONS UPDATED IN THIS ROUND").
    const tiersRequested = protomapsLayerCalls.map((c) => c.tier);
    expect(tiersRequested).toContain('world');
    expect(tiersRequested).toContain('local');
  });

  it('does not remount MapContainer for an unrelated prop change (same theme)', () => {
    mockUseTheme.mockReturnValue({ resolved: 'light' });
    const { rerender } = render(
      <LocationMap
        locations={LOCATIONS}
        selectedId={null}
        onSelectLocation={vi.fn()}
        variant="full"
      />,
    );
    expect(mapContainerMountSpy).toHaveBeenCalledTimes(1);

    rerender(
      <LocationMap
        locations={LOCATIONS}
        selectedId={null}
        onSelectLocation={vi.fn()}
        variant="full"
        hoveredId="huntington-city-beach-pier"
      />,
    );

    expect(mapContainerMountSpy).toHaveBeenCalledTimes(1);
  });
});

describe('LocationMap — CS-BASEMAP (M1) dark theme', () => {
  it('renders the world+local ProtomapsLayer pair and no CARTO/raster TileLayer', () => {
    mockUseTheme.mockReturnValue({ resolved: 'dark' });
    render(
      <LocationMap
        locations={LOCATIONS}
        selectedId={null}
        onSelectLocation={vi.fn()}
        variant="full"
      />,
    );

    const tiersRequested = protomapsLayerCalls.map((c) => c.tier);
    expect(tiersRequested).toContain('world');
    expect(tiersRequested).toContain('local');
    // Dark theme has TILE_CONFIG only for `light` (plan §M1 "Lead mechanics
    // — dashboard side") — no TileLayer of any kind renders in dark theme.
    expect(screen.queryAllByTestId('tile-layer')).toHaveLength(0);
  });
});

describe('LocationMap — CS-BASEMAP (M1) light theme', () => {
  it('renders exactly one OSM TileLayer plus the world+local labels ProtomapsLayer pair', () => {
    mockUseTheme.mockReturnValue({ resolved: 'light' });
    render(
      <LocationMap
        locations={LOCATIONS}
        selectedId={null}
        onSelectLocation={vi.fn()}
        variant="full"
      />,
    );

    const tileLayers = screen.getAllByTestId('tile-layer');
    expect(tileLayers).toHaveLength(1);
    expect(tileLayers[0].getAttribute('data-url')).toBe(LIGHT_BASE_URL);

    // The old CARTO `light_only_labels` overlay is now ProtomapsLayer
    // mode="labels", per theme, both tiers (plan §M1) — light theme is NOT
    // exempt: it gets the labels layer too, just not a dark base layer.
    const labelCalls = protomapsLayerCalls.filter((c) => c.mode === 'labels');
    const labelTiers = labelCalls.map((c) => c.tier);
    expect(labelTiers).toContain('world');
    expect(labelTiers).toContain('local');
  });
});

describe('map-attribution.ts — PROTOMAPS_OSM_ATTRIBUTION', () => {
  it('contains "Protomaps"', () => {
    expect(PROTOMAPS_OSM_ATTRIBUTION).toContain('Protomaps');
  });
});
