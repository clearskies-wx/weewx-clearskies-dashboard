// useRealtimeObservation.ts — Merged observation hook.
//
// Combines:
//   1. useObservation() — initial load from GET /current (REST via BFF)
//   2. useSSE()         — real-time updates from GET /sse (live loop packets via BFF)
//
// When an SSE loop packet arrives, its fields are mapped to the Observation
// type and shallow-merged over the current observation state.  Fields not
// present in the packet remain unchanged.
//
// Return shape matches useObservation() exactly so now.tsx can do a
// drop-in import swap with no other changes.
//
// ---------------------------------------------------------------------------
// Field mapping rationale (post ADR-041/ADR-042)
// ---------------------------------------------------------------------------
// The BFF (ADR-041) applies unit conversion and emits ConvertedValue objects
// for all numeric observation fields.  SSE packets from the BFF now carry
// ConvertedValue objects (not raw numbers) for weather fields.
//
// The SSE path stores ConvertedValue objects directly — no client-side
// coercion to numbers.  The BFF handles MQTT suffix stripping and conversion
// before the SSE event reaches the browser.
//
// The ONE special case is dateTime — still a raw integer epoch (seconds)
// from the BFF's SSE stream:
//   weewx "dateTime"  → integer epoch (seconds)
//   Observation.timestamp → UTC ISO-8601 string (e.g. "2026-05-19T12:00:00Z")
//
// New BFF-computed fields also arrive in SSE packets:
//   beaufort      → ConvertedValue { value, label, formatted }
//   comfortIndex  → "windChill" | "heatIndex" | "none"
//
// The SSE source field is fixed to "weewx-sse" to distinguish it from REST.
//
// Unknown fields in the packet are ignored.

import { useState, useEffect, useMemo, useRef } from 'react';
import { useObservation } from './useWeatherData';
import { useSSE } from './useSSE';
import { isMockMode } from '../api/client';
import type { Observation, UnitsBlock, ConvertedValue, CurrentResponse, SceneDescriptor } from '../api/types';

// ---------------------------------------------------------------------------
// SSE URL config
// ---------------------------------------------------------------------------

/**
 * The SSE URL comes from VITE_SSE_URL (full URL, e.g. http://host:8080/sse).
 * An empty string means SSE is not configured; no connection is attempted.
 */
function getSseUrl(): string {
  return (import.meta.env.VITE_SSE_URL as string | undefined) ?? '';
}

// ---------------------------------------------------------------------------
// WEEWX_TO_OBSERVATION mapping
//
// Keys: weewx loop packet field names.
// Values: the corresponding key on the Observation interface.
//
// Only fields that exist on Observation are listed.  Extra weewx fields
// (e.g. usUnits, interval, txBattStatus, etc.) are intentionally omitted —
// they are not part of the Observation contract.
// ---------------------------------------------------------------------------

type ObservationKey = keyof Observation;

/**
 * Mapping from weewx raw loop packet field names to Observation field names.
 *
 * For most fields the names are identical (weewx canonical = Observation key
 * per ADR-010).  The only structural difference is dateTime (epoch int) which
 * maps to timestamp (ISO string) and requires a conversion step below.
 */
export const WEEWX_TO_OBSERVATION: Readonly<Record<string, ObservationKey>> = {
  outTemp:      'outTemp',
  outHumidity:  'outHumidity',
  windSpeed:    'windSpeed',
  windDir:      'windDir',
  windGust:     'windGust',
  windGustDir:  'windGustDir',
  barometer:    'barometer',
  pressure:     'pressure',
  altimeter:    'altimeter',
  dewpoint:     'dewpoint',
  windchill:    'windchill',
  heatindex:    'heatindex',
  rainRate:     'rainRate',
  rain:         'rain',
  barometerTrend: 'barometerTrend',
  radiation:    'radiation',
  UV:           'UV',
  inTemp:       'inTemp',
  inHumidity:   'inHumidity',
  appTemp:      'appTemp',
  lightning_strike_count:    'lightning_strike_count',
  lightning_strike_count_1h: 'lightning_strike_count_1h',
  lightning_distance:        'lightning_distance',
  lightning_last_det_time:   'lightning_last_det_time',
  // BFF-computed derived fields (ADR-042):
  beaufort:     'beaufort',
  // dateTime, comfortIndex, windDirCardinal, windGustDirCardinal are handled separately below.
} as const;

// ---------------------------------------------------------------------------
// Packet → partial Observation mapper
// ---------------------------------------------------------------------------

/**
 * Determine whether an unknown value is a ConvertedValue object from the BFF.
 * ConvertedValue has { value: number|null, label: string, formatted: string }.
 */
function isConvertedValue(val: unknown): val is ConvertedValue {
  return (
    typeof val === 'object' &&
    val !== null &&
    'value' in val &&
    'label' in val &&
    'formatted' in val
  );
}

/**
 * Convert a BFF SSE packet to a partial Observation.
 *
 * The BFF (ADR-041) converts MQTT field values to ConvertedValue objects
 * before emitting the SSE event.  This function passes ConvertedValue objects
 * through directly.  Raw numbers (for fields the BFF has no conversion for)
 * are kept as-is — asConverted() in components handles both cases.
 *
 * Unknown packet fields are silently ignored.
 */
export function mapPacketToObservation(
  packet: Record<string, unknown>,
): Partial<Observation> {
  const partial: Partial<Observation> = {};

  // Handle dateTime → timestamp conversion.
  // dateTime is still a raw Unix epoch integer (seconds) from the BFF.
  const dt = packet['dateTime'];
  if (typeof dt === 'number' && dt > 0) {
    partial.timestamp = new Date(dt * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  } else if (typeof dt === 'string') {
    const n = Number(dt);
    if (Number.isFinite(n) && n > 0) {
      partial.timestamp = new Date(n * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
  }

  // Handle comfortIndex — BFF emits a plain string, not a ConvertedValue.
  const ci = packet['comfortIndex'];
  if (ci === 'windChill' || ci === 'heatIndex' || ci === 'none') {
    partial.comfortIndex = ci;
  }

  // Handle windDirCardinal / windGustDirCardinal — BFF emits canonical 16-point
  // cardinal codes as plain strings (ADR-041).  Pass through as-is; do NOT run
  // through the numeric coercion path used for weather observation fields.
  // null is a valid value (direction sensor not available).
  const wdc = packet['windDirCardinal'];
  if (typeof wdc === 'string') {
    partial.windDirCardinal = wdc;
  } else if (wdc === null) {
    partial.windDirCardinal = null;
  }
  const wgdc = packet['windGustDirCardinal'];
  if (typeof wgdc === 'string') {
    partial.windGustDirCardinal = wgdc;
  } else if (wgdc === null) {
    partial.windGustDirCardinal = null;
  }

  // Map all other fields (ConvertedValue or raw number/null).
  for (const [weewxKey, obsKey] of Object.entries(WEEWX_TO_OBSERVATION)) {
    const val = packet[weewxKey];
    if (val === undefined) continue;
    // Null is a valid value (sensor not available) — include it.
    let coerced: unknown = val;
    if (isConvertedValue(val)) {
      // BFF-converted field: store as-is.
      coerced = val;
    } else if (typeof val === 'string') {
      // Legacy path: raw string number (older BFF without conversion for this group).
      const n = Number(val);
      coerced = Number.isFinite(n) ? n : null;
    }
    // Type assertion: Observation field values are ConvertedValue | number | string | boolean | null.
    (partial as Record<string, unknown>)[obsKey] = coerced;
  }

  // NOTE: Observation.extras (custom weewx columns) is NOT updated from SSE
  // packets.  Loop packets may carry custom columns but they are not mapped
  // here — extras stays at the REST baseline value until the next /current
  // fetch.  Revisit when ADR-035 custom column promotion is implemented.

  // Mark the source so consumers can tell SSE data apart from REST data.
  partial.source = 'weewx-sse';

  return partial;
}

// ---------------------------------------------------------------------------
// Hook result type (matches useObservation / HookResult<Observation>)
// ---------------------------------------------------------------------------

interface RealtimeObservationResult {
  data: Observation | null;
  units?: UnitsBlock;
  source?: string;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
  /** BFF-computed pressure trend direction from the /current envelope (ADR-041/ADR-042). */
  barometerTrendDirection: CurrentResponse['barometerTrendDirection'];
  /** 10-minute average wind speed from BFF rolling window. */
  windSpeedAvg10m: CurrentResponse['windSpeedAvg10m'];
  /** Max gust over last 10 minutes from BFF rolling window. */
  windGustMax10m: CurrentResponse['windGustMax10m'];
  /**
   * ADR-047 background scene descriptor.  Sourced from the REST /current envelope
   * via useObservation().  Scene changes on weather-condition timescales (minutes),
   * not loop-packet timescales, so REST polling is sufficient.
   * Falls back to SCENE_DEFAULT (clear / daytime / no overlay) when absent.
   */
  scene: SceneDescriptor;
}

function getCachedScene(): SceneDescriptor {
  if (typeof window === 'undefined') return { sky: 'clear', daytime: true, overlay: null };
  const sky = localStorage.getItem('clearskies.scene.sky');
  const daytime = localStorage.getItem('clearskies.scene.daytime');
  const overlay = localStorage.getItem('clearskies.scene.overlay');
  return {
    sky: (sky === 'clear' || sky === 'cloudy' || sky === 'storm') ? sky : 'clear',
    daytime: daytime !== 'false',
    overlay: overlay === 'rain' ? 'rain' : overlay === 'snow' ? 'snow' : null,
  };
}

const SCENE_DEFAULT: SceneDescriptor = getCachedScene();

// ---------------------------------------------------------------------------
// useRealtimeObservation
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for useObservation() that supplements REST polling
 * with real-time SSE updates.
 *
 * Behaviour:
 * - Calls useObservation() for the initial load and exposes its loading/error state.
 * - Opens an SSE connection to VITE_SSE_URL (skipped when URL is empty or in mock mode).
 * - Each arriving "loop" packet is mapped and shallow-merged onto the observation state.
 * - Returns the same { data, loading, error, refetch } shape as useObservation().
 */
export function useRealtimeObservation(): RealtimeObservationResult {
  const {
    data: initialData,
    units,
    source: restSource,
    loading,
    error,
    refetch,
    barometerTrendDirection,
    windSpeedAvg10m,
    windGustMax10m,
    scene: restScene,
  } = useObservation();

  // Accumulate SSE overlay patches on top of the REST base observation.
  // We keep a mutable ref for the patches so we can merge without triggering
  // extra renders from effect-side setState calls.
  const [sseOverlay, setSseOverlay] = useState<Partial<Observation> | null>(null);

  // Track the last packet ref so we only call setSseOverlay on new packets.
  const lastPacketRef = useRef<Record<string, unknown> | null>(null);

  // SSE connection — skipped when mock mode is active.
  const sseUrl = useMemo(() => (isMockMode() ? '' : getSseUrl()), []);
  const { packet } = useSSE(sseUrl);

  // When a new packet arrives, compute and store the overlay.
  // We compare by reference: packet identity changes each time useSSE updates.
  useEffect(() => {
    if (packet === null || packet === lastPacketRef.current) return;
    lastPacketRef.current = packet;
    const partial = mapPacketToObservation(packet);
    setSseOverlay((prev) => (prev === null ? partial : { ...prev, ...partial }));
  }, [packet]);

  // Merge: base REST observation + accumulated SSE overlay.
  const data = useMemo<Observation | null>(() => {
    if (initialData === null) return null;
    if (sseOverlay === null) return initialData;
    return { ...initialData, ...sseOverlay };
  }, [initialData, sseOverlay]);

  // Scene: sourced from the REST /current envelope (useObservation).
  // The scene changes on weather-condition timescales (minutes), not loop-packet
  // timescales (seconds), so REST polling is sufficient — no SSE tracking needed.
  const scene = restScene ?? SCENE_DEFAULT;

  return {
    data,
    units,
    source: data?.source ?? restSource,
    loading,
    error,
    refetch,
    barometerTrendDirection,
    windSpeedAvg10m,
    windGustMax10m,
    scene,
  };
}
