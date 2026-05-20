// useSSE.ts — Native EventSource hook for the clearskies-realtime /sse endpoint.
//
// The realtime service emits NAMED events of type "loop".
// EventSource.onmessage only fires for UNNAMED events (type "message").
// We MUST use addEventListener("loop", handler) — not onmessage.
//
// No new npm dependencies: native browser EventSource API only.
//
// Lint note: react-hooks/set-state-in-effect flags the setStatus('connecting')
// call below.  This is the same pattern as the project's existing useApiQuery.ts
// (setLoading(false) in effect body) and theme-provider.tsx.  The pattern is
// correct — the status must update synchronously with the effect so consumers
// see 'connecting' on the render that follows opening the EventSource.  Fixing
// this across the codebase (e.g. via useReducer or derived state) is tracked as
// a separate lint-cleanup task.

import { useState, useEffect } from 'react';
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

  useEffect(() => {
    // Do not connect in mock mode or when no URL is configured.
    // Status stays 'disconnected' (initial value) — no setState needed.
    if (isMockMode() || !url) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        setPacket(data);
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
  }, [url]);

  return { packet, status };
}
