// LocationMap.test.tsx — M3 (MARINE-PAGE-FIXIT-PLAN-2026-08-10 §PHASE M).
//
// Covers M1 (tile-error banner + retry) and M2 (theme-keyed MapContainer
// atomic remount) — the fix for fixit log Item 6 ("main map sometimes
// missing layers"): silent gray becomes impossible (tiles or banner, never
// neither), and a theme flip can no longer strand the label layer without
// its base layer.
//
// react-leaflet is mocked at the module level: real Leaflet needs actual
// DOM tile loading/measurement that jsdom doesn't provide, and this file
// only needs to exercise LocationMap's own event-handler wiring and its
// MapContainer key prop — not Leaflet's internals.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { render, screen, within, act } from '@testing-library/react';
import { LocationMap } from './LocationMap';
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
const { tileLayerHandlersByUrl, mapContainerMountSpy } = vi.hoisted(() => ({
  tileLayerHandlersByUrl: new Map<string, LeafletEventHandlerFnMap | undefined>(),
  mapContainerMountSpy: vi.fn(),
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

// Same URLs as TILE_CONFIG.light / LABEL_OVERLAY_URL in LocationMap.tsx.
const LIGHT_BASE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DARK_BASE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const LABEL_URL = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png';

beforeEach(() => {
  tileLayerHandlersByUrl.clear();
  mapContainerMountSpy.mockClear();
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

  it('shows the banner when the label overlay layer errors, independent of the base layer', () => {
    render(
      <LocationMap
        locations={LOCATIONS}
        selectedId={null}
        onSelectLocation={vi.fn()}
        variant="full"
      />,
    );

    fireTileError(LABEL_URL);
    fireTileError(LABEL_URL);
    fireTileError(LABEL_URL);

    expect(screen.getByRole('status')).not.toBeNull();
  });
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
    expect(tileLayerHandlersByUrl.has(DARK_BASE_URL)).toBe(true);
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
