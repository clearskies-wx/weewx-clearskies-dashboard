// radar.ts — mock RadarFrameList for VITE_USE_MOCK mode.
// Frame timestamps are 10-minute intervals covering roughly the last hour.
// The `path` values match RainViewer's per-frame tile path pattern so the
// tileUrlTemplate in mockCapabilities resolves to a valid (but non-existent)
// URL in mock mode. Real tile fetches will 404; that's expected in mock mode.

import type { RadarFrameList } from '../api/types';

// 6 frames, 10 minutes apart, ending at a fixed reference time.
const REFERENCE_ISO = '2026-05-24T18:00:00Z';
const REFERENCE_UNIX = Math.floor(new Date(REFERENCE_ISO).getTime() / 1000);
const INTERVAL_SEC = 600; // 10 minutes

function frameAt(offsetFrames: number) {
  const unix = REFERENCE_UNIX - (5 - offsetFrames) * INTERVAL_SEC;
  const iso = new Date(unix * 1000).toISOString();
  return {
    time: iso,
    kind: offsetFrames === 5 ? ('current' as const) : ('past' as const),
    // RainViewer path embeds the Unix timestamp as a path segment.
    path: `/v2/radar/${unix}`,
  };
}

export const mockRadarFrameList: RadarFrameList = {
  providerId: 'rainviewer',
  frames: [0, 1, 2, 3, 4, 5].map(frameAt),
  attribution: 'RainViewer',
  // Mock tile host — tiles will 404 in mock mode; that is expected.
  tileHost: 'https://tilecache.rainviewer.com',
};
