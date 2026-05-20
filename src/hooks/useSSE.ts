// useSSE.ts — Native EventSource hook for the clearskies-realtime /sse endpoint.
//
// The realtime service emits NAMED events of type "loop".
// EventSource.onmessage only fires for UNNAMED events (type "message").
// We MUST use addEventListener("loop", handler) — not onmessage.
//
// No new npm dependencies: native browser EventSource API only.

import { useState, useEffect, useRef } from 'react';
import { isMockMode } from '../api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Connection lifecycle states surfaced to callers. */
export type SSEStatus = 'connecting' | 'connected' | 'disconnected';

export interface UseSSEResult {
  /** The most recently received and parsed loop packet, or null before the first event. */
  packet: Record<string, unknown> | null;
  /** Current connection status. */
  status: SSEStatus;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Opens a native EventSource connection to `url` and listens for "loop" events.
 *
 * - Skips entirely when mock mode is active.
 * - Skips entirely when `url` is empty/undefined.
 * - Parses each event's JSON data and exposes the latest packet.
 * - Exposes connection status (connecting / connected / disconnected).
 * - Closes the connection and cleans up on unmount.
 *
 * Browser EventSource auto-reconnects on network drop (default ~3 s backoff).
 * No manual retry logic is needed here.
 */
export function useSSE(url: string | undefined): UseSSEResult {
  const [packet, setPacket] = useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = useState<SSEStatus>('disconnected');

  // Stable ref so the effect closure always sees the latest setter without
  // re-running the effect when they change (they don't, but this is defensive).
  const setPacketRef = useRef(setPacket);
  setPacketRef.current = setPacket;

  useEffect(() => {
    // Do not connect in mock mode or when no URL is configured.
    if (isMockMode() || !url) {
      setStatus('disconnected');
      return;
    }

    setStatus('connecting');

    const es = new EventSource(url);

    // EventSource fires "open" once the connection is established.
    es.addEventListener('open', () => {
      setStatus('connected');
    });

    // CRITICAL: the realtime service emits a NAMED event type "loop".
    // onmessage only fires for the default unnamed event type.
    // We MUST use addEventListener here.
    es.addEventListener('loop', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>;
        setPacketRef.current(data);
      } catch {
        // Malformed JSON — ignore packet, stay connected.
      }
    });

    // EventSource fires "error" both for transient drops (it will reconnect
    // automatically) and for permanent failures (readyState === CLOSED).
    // We report "disconnected" on error; the browser will retry and fire
    // "open" again on reconnect.
    es.addEventListener('error', () => {
      setStatus('disconnected');
    });

    return () => {
      es.close();
      setStatus('disconnected');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return { packet, status };
}
