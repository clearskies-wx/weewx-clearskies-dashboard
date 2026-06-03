// seismic.tsx — Seismic page: side-by-side map + scrollable earthquake list.
// Renamed from earthquakes.tsx. Route: /seismic (App.tsx).
//
// Layout:
//   Desktop (lg+): CSS grid 2-column — map card left, list card right.
//   Mobile (<lg): stacked — map card (fixed 300px), list card below.
//
// Bidirectional interaction via selectedId state:
//   list click → map flies to earthquake + opens popup
//   map marker click → list scrolls to row

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MapContainer,
  TileLayer,
  Marker,
  CircleMarker,
  Popup,
  GeoJSON,
  useMap,
} from 'react-leaflet';
import { useTheme } from '../lib/theme-provider';
import type { PathOptions, LatLngBoundsExpression } from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import type { EarthquakeRecord } from '../api/types';
import { useEarthquakes, useStation, useEarthquakeConfig, useEarthquakeFaults } from '../hooks/useWeatherData';
import { formatValue } from '../utils/format';
import { magnitudeClasses, alertClasses } from '../utils/earthquake';

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function formatTime(isoString: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
    timeZoneName: 'short',
  }).format(new Date(isoString));
}

function ageColor(time: string, oldestTime: string, newestTime: string): string {
  const t = new Date(time).getTime();
  const lo = new Date(oldestTime).getTime();
  const hi = new Date(newestTime).getTime();
  const ratio = hi === lo ? 1 : (t - lo) / (hi - lo);
  const r = Math.round(239 * ratio + 59 * (1 - ratio));
  const g = Math.round(68 * ratio + 130 * (1 - ratio));
  const b = Math.round(68 * ratio + 246 * (1 - ratio));
  return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Loading/Error sub-components
// ---------------------------------------------------------------------------

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

function TileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t: tc } = useTranslation('common');
  return (
    <div role="alert" className="flex flex-col gap-2 items-start text-sm">
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        {tc('retry')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MapFlyTo — inner component that reads the Leaflet map instance and
// flies to the selected earthquake when selectedId changes.
// Must be rendered inside MapContainer.
// ---------------------------------------------------------------------------

interface MapFlyToProps {
  earthquakes: EarthquakeRecord[];
  selectedId: string | null;
}

function MapFlyTo({ earthquakes, selectedId }: MapFlyToProps) {
  const map = useMap();

  useEffect(() => {
    if (!selectedId) return;
    const eq = earthquakes.find((e) => e.id === selectedId);
    if (!eq) return;
    map.flyTo([eq.latitude, eq.longitude], 10, { duration: 0.8 });
  }, [selectedId, earthquakes, map]);

  return null;
}

// ---------------------------------------------------------------------------
// Basemap tile configurations for light and dark themes.
// Light: standard OpenStreetMap tiles.
// Dark: CartoDB dark_all — free, no API key required.
// The key prop on TileLayer forces Leaflet to re-mount when the URL changes
// because Leaflet's TileLayer does not support dynamic URL updates in-place.
// ---------------------------------------------------------------------------

const TILE_CONFIG = {
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  },
} as const;

// ---------------------------------------------------------------------------
// Fault layer style — amber color per ADR-046 implementation guidance.
// ---------------------------------------------------------------------------

const FAULT_STYLE: PathOptions = {
  color: '#b45309',
  weight: 1.5,
  opacity: 0.6,
};

// ---------------------------------------------------------------------------
// SeismicPage
// ---------------------------------------------------------------------------

export function SeismicPage() {
  const { t, i18n } = useTranslation('seismic');
  const locale = i18n.language;
  const { resolved: resolvedTheme } = useTheme();
  const baseTile = TILE_CONFIG[resolvedTheme];

  const { data: earthquakes, loading, error, refetch } = useEarthquakes();
  const { data: station } = useStation();
  const { data: config } = useEarthquakeConfig();
  const { data: faults } = useEarthquakeFaults();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFaults, setShowFaults] = useState(true);

  const oldestTime = earthquakes && earthquakes.length > 0
    ? earthquakes.reduce((a, b) => (a.time < b.time ? a : b)).time : '';
  const newestTime = earthquakes && earthquakes.length > 0
    ? earthquakes.reduce((a, b) => (a.time > b.time ? a : b)).time : '';

  // Row refs — keyed by earthquake id, used for smooth scroll-into-view.
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const registerRowRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      rowRefs.current.set(id, el);
    } else {
      rowRefs.current.delete(id);
    }
  }, []);

  const hasStation = station !== null;
  const center: [number, number] = hasStation
    ? [station.latitude, station.longitude]
    : [0, 0];
  const radiusKm = config?.radiusKm ?? 100;
  const bufferKm = radiusKm * 1.15;
  const deltaLat = hasStation ? bufferKm / 111 : 90;
  const deltaLon = hasStation ? bufferKm / (111 * Math.cos(station.latitude * Math.PI / 180)) : 180;
  const initialBounds: LatLngBoundsExpression = hasStation
    ? [[station.latitude - deltaLat, station.longitude - deltaLon],
       [station.latitude + deltaLat, station.longitude + deltaLon]]
    : [[-60, -180], [60, 180]];

  // When selectedId changes via a map marker click, scroll the list row into view.
  useEffect(() => {
    if (!selectedId) return;
    const el = rowRefs.current.get(selectedId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedId]);

  // Build the fault attribution string for the map's attribution control.
  const faultAttribution = faults?.attribution
    ? `<a href="https://github.com/GEMScienceTools/gem-global-active-faults" target="_blank" rel="noopener noreferrer">${faults.attribution}</a>`
    : '';

  return (
    // h-full + flex-col so the grid below can stretch to fill the available
    // main-element height rather than overflowing the viewport.
    <div className="flex flex-col gap-4 p-2 md:p-4 h-full">
      <h1 className="text-2xl font-bold text-foreground shrink-0">{t('title')}</h1>

      {/* Config info bar — compact single-line display of operator settings */}
      {config && (
        <p className="text-sm text-muted-foreground shrink-0" aria-label={t('configAriaLabel')}>
          {t('configSummary', {
            provider: config.provider.toUpperCase(),
            radiusKm: config.radiusKm,
            minMagnitude: config.minMagnitude.toFixed(1),
            days: config.defaultDays,
          })}
        </p>
      )}

      {loading && (
        <>
          <span className="sr-only" role="status">{t('loadingData')}</span>
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TileSkeleton className="h-[300px] lg:h-full" />
            <TileSkeleton className="h-[300px] lg:h-full" />
          </div>
        </>
      )}

      {error && <TileError message={t('unableToLoad')} onRetry={refetch} />}

      {!loading && !error && earthquakes !== null && (
        // flex-1 min-h-0: takes remaining height after the h1 + config bar,
        // min-h-0 prevents flex children from ignoring the overflow boundary.
        // On desktop: grid-cols-2 side-by-side. On mobile: stacked (grid-cols-1).
        // Wrapper div so the GEM attribution can sit below the grid as a sibling.
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ----------------------------------------------------------------
              LEFT: Map card
              Desktop: h-full fills the grid row (bounded by flex-1 parent).
              Mobile: fixed h-[300px] so the list is immediately visible below.
          ---------------------------------------------------------------- */}
          <Card className="overflow-hidden flex flex-col h-[300px] lg:h-full">
            <CardHeader className="pb-2 shrink-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle as="h2">{t('mapCardTitle')}</CardTitle>
                {/* Fault toggle — checkbox with visible label (§5.2 / §5.3) */}
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showFaults}
                    onChange={(e) => setShowFaults(e.target.checked)}
                    className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    aria-label={t('showFaultsAriaLabel')}
                  />
                  {t('showFaults')}
                </label>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0">
              <div
                className="h-full"
                role="region"
                aria-label={t('mapCardTitle')}
              >
                <MapContainer
                  bounds={initialBounds}
                  className="h-full w-full"
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    key={baseTile.url}
                    url={baseTile.url}
                    attribution={`${baseTile.attribution}${faultAttribution ? ' | ' + faultAttribution : ''}`}
                  />

                  {/* Station marker */}
                  {hasStation && (
                    <Marker position={center}>
                      <Popup>{t('stationLocation')}</Popup>
                    </Marker>
                  )}

                  {/* Earthquake markers */}
                  {earthquakes.map((eq) => {
                    const isSelected = eq.id === selectedId;
                    const baseRadius = Math.max(4, eq.magnitude * 3);
                    return (
                      <CircleMarker
                        key={eq.id}
                        center={[eq.latitude, eq.longitude]}
                        radius={isSelected ? baseRadius * 1.6 : baseRadius}
                        pathOptions={{
                          color: ageColor(eq.time, oldestTime, newestTime),
                          fillColor: ageColor(eq.time, oldestTime, newestTime),
                          fillOpacity: isSelected ? 0.85 : 0.6,
                          weight: isSelected ? 2.5 : 1,
                        }}
                        eventHandlers={{
                          click: () => {
                            setSelectedId(eq.id);
                          },
                        }}
                      >
                        <Popup>
                          <div>
                            <strong>{eq.place ?? t('unknownLocation')}</strong><br />
                            {t('magnitude')}: {formatValue(eq.magnitude, 'earthquakeMag')}{eq.magnitudeType ? ` ${eq.magnitudeType}` : ''}<br />
                            {eq.depth !== null ? <>{t('depthLabel')}: {formatValue(eq.depth, 'earthquakeDepth')} km<br /></> : null}
                            {eq.alert !== null ? <>{t('pager', { level: eq.alert })}<br /></> : null}
                            {/* ADR-020: use station-local time, matching the list panel below */}
                            {formatTime(eq.time, station?.timezone ?? 'UTC', locale)}
                          </div>
                        </Popup>
                      </CircleMarker>
                    );
                  })}

                  {/* Fault line overlay — GEM GAF-DB, CC-BY-SA 4.0 (ADR-046) */}
                  {showFaults && faults && faults.features.length > 0 && (
                    <GeoJSON
                      key={showFaults ? 'faults-on' : 'faults-off'}
                      data={faults as unknown as GeoJsonObject}
                      style={FAULT_STYLE}
                      onEachFeature={(feature, layer) => {
                        const props = feature.properties as {
                          name?: string | null;
                          slip_type?: string | null;
                          [key: string]: unknown;
                        } | null;
                        if (!props) return;
                        const name = props.name ?? t('unknownFault');
                        const slip = props.slip_type ?? t('unknownSlipType');
                        layer.bindPopup(`<strong>${name}</strong><br />${t('slipType')}: ${slip}`);
                      }}
                    />
                  )}

                  {/* Fly-to inner component — must be inside MapContainer */}
                  <MapFlyTo earthquakes={earthquakes} selectedId={selectedId} />
                </MapContainer>
              </div>
            </CardContent>
          </Card>

          {/* ----------------------------------------------------------------
              RIGHT: Scrollable earthquake list
              Desktop: h-full matches the grid row height (set by the map card),
                       overflow-y-auto makes it scroll within that fixed height.
              Mobile: naturally tall (grid-cols-1 so each card sizes to content).
          ---------------------------------------------------------------- */}
          <Card className="flex flex-col lg:h-full">
            <CardHeader className="pb-2 shrink-0">
              <CardTitle as="h2">{t('listCardTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
              {earthquakes.length === 0 ? (
                <p className="px-4 py-8 text-center text-muted-foreground text-sm">
                  {t('noRecentQuakes')}
                </p>
              ) : (
                <div
                  className="overflow-y-auto lg:h-full"
                  role="region"
                  aria-label={t('ariaRecentList')}
                  // tabIndex so keyboard users can scroll the list with arrow keys
                  // after focusing it (WCAG 2.1 SC 2.1.1).
                  tabIndex={0}
                >
                  <ul className="flex flex-col divide-y divide-border" role="list">
                    {earthquakes.map((quake) => {
                      const { bg, text } = magnitudeClasses(quake.magnitude);
                      const isSelected = quake.id === selectedId;
                      return (
                        <li key={quake.id}>
                          {/* Use <button> not <div onClick> — keyboard reachable + announced as actionable (§5.2) */}
                          <button
                            type="button"
                            ref={(el) => registerRowRef(quake.id, el as HTMLDivElement | null)}
                            onClick={() => setSelectedId(quake.id)}
                            aria-pressed={isSelected}
                            aria-label={t('rowAriaLabel', {
                              mag: formatValue(quake.magnitude, 'earthquakeMag'),
                              place: quake.place ?? t('unknownLocation'),
                            })}
                            className={[
                              'w-full text-left px-4 py-3 transition-colors duration-100',
                              'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                              isSelected
                                ? 'bg-accent/60 ring-1 ring-inset ring-primary/30'
                                : 'hover:bg-accent/30',
                            ].join(' ')}
                          >
                            <div className="flex items-start gap-3">
                              {/* Magnitude badge — color + numeric value (§5.1: not color-only) */}
                              <div
                                className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg overflow-hidden ${bg}`}
                                aria-hidden="true"
                              >
                                <span className={`text-xs leading-none ${text}`}>M</span>
                                <span className={`text-xl font-bold leading-none mt-0.5 ${text}`}>
                                  {formatValue(quake.magnitude, 'earthquakeMag')}
                                </span>
                              </div>

                              <div className="flex flex-col gap-0.5 min-w-0">
                                <p className="font-semibold text-foreground leading-snug text-sm truncate">
                                  {quake.place ?? t('unknownLocation')}
                                  {quake.magnitudeType && (
                                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                                      ({quake.magnitudeType.toLowerCase()})
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatTime(quake.time, station?.timezone ?? 'UTC', locale)}
                                </p>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                                  {quake.depth !== null && (
                                    <span>{t('depth', { depth: formatValue(quake.depth, 'earthquakeDepth') })}</span>
                                  )}
                                  <span>{t('source', { source: quake.source.toUpperCase() })}</span>
                                  {quake.felt !== null && (
                                    <span>{t('feltBy', { count: quake.felt })}</span>
                                  )}
                                  {quake.tsunami && (
                                    <span className="font-medium text-amber-700 dark:text-amber-400">
                                      {t('tsunamiWatch')}
                                    </span>
                                  )}
                                  {quake.alert !== null && (
                                    <span
                                      className={`inline-block rounded px-1 py-0.5 font-medium capitalize ${alertClasses(quake.alert)}`}
                                    >
                                      {t('pager', { level: quake.alert })}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
          </div>{/* end grid */}

          {/* GEM fault attribution — only shown when fault layer is visible */}
          {showFaults && faults && faults.features.length > 0 && (
            <p className="shrink-0 text-xs text-muted-foreground/70">
              {faults.attribution}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default SeismicPage;
