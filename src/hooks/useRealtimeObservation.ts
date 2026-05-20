// useRealtimeObservation.ts — Merged observation hook.
//
// Combines:
//   1. useObservation() — initial load from GET /current (REST, archive row)
//   2. useSSE()         — real-time updates from GET /sse (live loop packets)
//
// When an SSE loop packet arrives, its fields are mapped to the Observation
// type and shallow-merged over the current observation state.  Fields not
// present in the packet remain unchanged.
//
// Return shape matches useObservation() exactly so now.tsx can do a
// drop-in import swap with no other changes.
//
// ---------------------------------------------------------------------------
// Field mapping rationale
// ---------------------------------------------------------------------------
// Per ADR-010 the canonical data model uses weewx camelCase field names
// as-is.  The API's /current endpoint reads archive rows and maps them
// directly: archive column "outTemp" → Observation.outTemp, etc.
// NO unit conversion happens server-side (ADR-019): the API passes the
// weewx target_unit through unchanged.
//
// SSE sends the raw weewx loop packet.  The loop packet field names are
// the same weewx names.  Therefore the mapping for numeric fields is:
//   weewx loop packet key === Observation key  (1-to-1, no rename, no convert)
//
// The ONE exception is the timestamp:
//   weewx "dateTime"  → integer epoch (seconds)
//   Observation.timestamp → UTC ISO-8601 string (e.g. "2026-05-19T12:00:00Z")
//
// The SSE source field is fixed to "weewx-sse" to distinguish it from REST.
//
// Unknown fields in the packet are ignored.

import { useState, useEffect, useMemo } from 'react';
import { useObservation } from './useWeatherData';
import { useSSE } from './useSSE';
import { isMockMode } from '../api/client';
import type { Observation, UnitsBlock } from '../api/types';

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
  // dateTime is handled separately (epoch → ISO string conversion).
} as const;

// ---------------------------------------------------------------------------
// Packet → partial Observation mapper
// ---------------------------------------------------------------------------

/**
 * Convert a raw weewx loop packet to a partial Observation.
 *
 * Only mapped fields with non-null values are included in the result.
 * Unknown packet fields are silently ignored.
 */
export function mapPacketToObservation(
  packet: Record<string, unknown>,
): Partial<Observation> {
  const partial: Partial<Observation> = {};

  // Handle dateTime → timestamp conversion.
  // weewx dateTime is a Unix epoch integer (seconds since 1970-01-01T00:00:00Z).
  const dt = packet['dateTime'];
  if (typeof dt === 'number' && dt > 0) {
    partial.timestamp = new Date(dt * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  // Map all other fields.
  for (const [weewxKey, obsKey] of Object.entries(WEEWX_TO_OBSERVATION)) {
    const val = packet[weewxKey];
    if (val === undefined) continue;
    // Null is a valid value (sensor not available) — include it.
    // Type assertion: Observation field values are number | string | boolean | null.
    // The loop packet carries the same types for these fields.
    (partial as Record<string, unknown>)[obsKey] = val;
  }

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
}

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
  } = useObservation();

  // Local merged state — starts from the REST observation, updated by SSE.
  const [merged, setMerged] = useState<Observation | null>(null);

  // When the REST load completes (or mock data arrives), seed the merged state.
  useEffect(() => {
    if (initialData !== null) {
      setMerged(initialData);
    }
  }, [initialData]);

  // SSE connection — skipped when mock mode is active (url check is inside useSSE,
  // but we also guard here to avoid computing the URL in tests unnecessarily).
  const sseUrl = useMemo(() => (isMockMode() ? '' : getSseUrl()), []);
  const { packet } = useSSE(sseUrl);

  // When a new packet arrives, map it and merge over the current observation.
  useEffect(() => {
    if (packet === null) return;

    const partial = mapPacketToObservation(packet);

    setMerged((prev) => {
      if (prev === null) {
        // No base observation yet — cannot merge.  Wait for REST to load first.
        return prev;
      }
      return { ...prev, ...partial };
    });
  }, [packet]);

  return {
    data: merged,
    units,
    source: merged?.source ?? restSource,
    loading,
    error,
    refetch,
  };
}
