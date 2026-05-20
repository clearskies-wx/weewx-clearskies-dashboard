// useSSE.test.ts
// Tests for the SSE EventSource hook.
//
// Strategy: mock the global EventSource with a controlled fake that lets us
// fire events manually.  Mock isMockMode() via vi.mock.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSSE } from './useSSE';

// ---------------------------------------------------------------------------
// Mock isMockMode
// ---------------------------------------------------------------------------

vi.mock('../api/client', () => ({
  isMockMode: vi.fn(() => false),
}));

import { isMockMode } from '../api/client';
const mockIsMockMode = isMockMode as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fake EventSource
// ---------------------------------------------------------------------------

type EventMap = Record<string, ((event: MessageEvent) => void)[]>;

class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  readyState = FakeEventSource.CONNECTING;
  url: string;
  private _listeners: EventMap = {};

  // Track all instances created during the test.
  static instances: FakeEventSource[] = [];

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this._listeners[type]) return;
    this._listeners[type] = this._listeners[type].filter((l) => l !== listener);
  }

  /** Test helper: fire a named event. */
  emit(type: string, data: unknown) {
    const handlers = this._listeners[type] ?? [];
    const event = { type, data: JSON.stringify(data) } as MessageEvent;
    handlers.forEach((h) => h(event));
  }

  /** Test helper: simulate connection established. */
  open() {
    this.readyState = FakeEventSource.OPEN;
    this.emit('open', null);
  }

  /** Test helper: simulate error (e.g. network drop). */
  triggerError() {
    this.readyState = FakeEventSource.CLOSED;
    this.emit('error', null);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

// Install the fake before each test and restore after.
beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  mockIsMockMode.mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSSE', () => {
  it('starts in disconnected state when no URL is given', () => {
    const { result } = renderHook(() => useSSE(''));
    expect(result.current.status).toBe('disconnected');
    expect(result.current.packet).toBeNull();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('starts in disconnected state when URL is undefined', () => {
    const { result } = renderHook(() => useSSE(undefined));
    expect(result.current.status).toBe('disconnected');
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('skips EventSource entirely when mock mode is active', () => {
    mockIsMockMode.mockReturnValue(true);
    const { result } = renderHook(() => useSSE('http://localhost:8766/sse'));
    expect(result.current.status).toBe('disconnected');
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it('creates an EventSource and sets status to connecting when URL is provided', () => {
    const { result } = renderHook(() => useSSE('http://localhost:8766/sse'));
    expect(result.current.status).toBe('connecting');
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('http://localhost:8766/sse');
  });

  it('transitions to connected when the EventSource open event fires', () => {
    const { result } = renderHook(() => useSSE('http://localhost:8766/sse'));
    const es = FakeEventSource.instances[0];

    act(() => {
      es.open();
    });

    expect(result.current.status).toBe('connected');
  });

  it('listens for the named "loop" event (not onmessage)', () => {
    // The hook must use addEventListener("loop", ...) — if it used onmessage
    // the listener map would have "message" instead of "loop".
    renderHook(() => useSSE('http://localhost:8766/sse'));
    const es = FakeEventSource.instances[0];

    // After hook runs, the "loop" listener must be registered.
    expect((es as unknown as { _listeners: EventMap })._listeners['loop']).toBeDefined();
    expect((es as unknown as { _listeners: EventMap })._listeners['loop']).toHaveLength(1);
  });

  it('parses a "loop" event and exposes the packet', () => {
    const { result } = renderHook(() => useSSE('http://localhost:8766/sse'));
    const es = FakeEventSource.instances[0];

    act(() => {
      es.open();
      es.emit('loop', { outTemp: 72.5, windSpeed: 5.2, dateTime: 1716120000 });
    });

    expect(result.current.packet).toEqual({
      outTemp: 72.5,
      windSpeed: 5.2,
      dateTime: 1716120000,
    });
  });

  it('updates packet on each subsequent "loop" event', () => {
    const { result } = renderHook(() => useSSE('http://localhost:8766/sse'));
    const es = FakeEventSource.instances[0];

    act(() => {
      es.open();
      es.emit('loop', { outTemp: 72.5, dateTime: 1716120000 });
    });
    expect(result.current.packet?.outTemp).toBe(72.5);

    act(() => {
      es.emit('loop', { outTemp: 73.1, dateTime: 1716120300 });
    });
    expect(result.current.packet?.outTemp).toBe(73.1);
  });

  it('ignores malformed (non-JSON) loop event data without crashing', () => {
    const { result } = renderHook(() => useSSE('http://localhost:8766/sse'));
    const es = FakeEventSource.instances[0];

    act(() => {
      es.open();
      // Inject malformed data by directly invoking the listener with bad JSON.
      const listeners = (es as unknown as { _listeners: EventMap })._listeners['loop'];
      if (listeners) {
        listeners.forEach((l) => l({ data: 'not json {{' } as MessageEvent));
      }
    });

    // Packet should remain null — no crash.
    expect(result.current.packet).toBeNull();
    expect(result.current.status).toBe('connected');
  });

  it('sets status to disconnected when an error event fires', () => {
    const { result } = renderHook(() => useSSE('http://localhost:8766/sse'));
    const es = FakeEventSource.instances[0];

    act(() => {
      es.open();
    });
    expect(result.current.status).toBe('connected');

    act(() => {
      es.triggerError();
    });
    expect(result.current.status).toBe('disconnected');
  });

  it('closes the EventSource on unmount', () => {
    // Verify that the cleanup function calls es.close() — the key contract.
    // After unmount, result.current reflects the last render, not post-unmount
    // state, so we verify readyState on the EventSource instance directly.
    const { unmount } = renderHook(() => useSSE('http://localhost:8766/sse'));
    const es = FakeEventSource.instances[0];

    act(() => { es.open(); });
    expect(es.readyState).toBe(FakeEventSource.OPEN);

    unmount();

    expect(es.readyState).toBe(FakeEventSource.CLOSED);
  });

  it('creates a new EventSource when the URL changes', () => {
    const { rerender } = renderHook(
      ({ url }: { url: string }) => useSSE(url),
      { initialProps: { url: 'http://localhost:8766/sse' } },
    );

    expect(FakeEventSource.instances).toHaveLength(1);

    act(() => {
      rerender({ url: 'http://localhost:9000/sse' });
    });

    // Old one is closed; new one is opened.
    expect(FakeEventSource.instances[0].readyState).toBe(FakeEventSource.CLOSED);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1].url).toBe('http://localhost:9000/sse');
  });
});
