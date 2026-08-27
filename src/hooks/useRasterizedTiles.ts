// useRasterizedTiles.ts — resolves a set of local-tier basemap tiles to
// rasterized PNG data URLs (M4 SURF-MAP-BASEMAP, PA9/Q5,
// MARINE-AND-MAPS-PLAN §M4 lead mechanics). Sole consumer: HeatMapCard.tsx's
// dark-theme surf height map background — light theme fetches OSM raster
// tiles directly (`substituteTileUrl`) and never calls this hook with
// `enabled=true`.
//
// Each tile resolves independently via `rasterizeBasemapTile`
// (src/lib/basemap.ts) and is added to the returned Record as soon as ITS
// OWN rasterization settles — the caller renders tiles incrementally as
// they arrive, not all-or-nothing. A tile whose rasterization rejects never
// appears in the Record (no fallback to a remote provider — directive 15;
// the caller renders nothing for that tile, per plan §M4).
//
// Cancellation: a stale in-flight resolution (superseded by unmount OR by
// the tile set changing before it settles) never calls `setState` — the
// effect's cleanup flips a `cancelled` flag checked in every `.then()`.

import { useEffect, useState } from 'react';
import { rasterizeBasemapTile } from '../lib/basemap';

export interface RasterizedTileKey {
  z: number;
  x: number;
  y: number;
}

function tileKey(t: RasterizedTileKey): string {
  return `${t.z}/${t.x}/${t.y}`;
}

/**
 * Resolves `tiles` to rasterized PNG data URLs, keyed `"{z}/{x}/{y}"`, for
 * HeatMapCard's dark-theme surf height map background. `enabled=false`
 * (light theme, or no imagery background this render) does no rasterization
 * work and clears any previously-resolved entries.
 */
export function useRasterizedTiles(
  tiles: RasterizedTileKey[],
  enabled: boolean,
): Record<string, string> {
  // Stable string so the effect only re-runs when the actual (z,x,y) set
  // changes, not on every render where the caller passes a
  // structurally-identical-but-newly-allocated array.
  const tileSetKey = tiles.map(tileKey).join(',');

  const [resolved, setResolved] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!enabled || tiles.length === 0) {
      setResolved({});
      return;
    }

    let cancelled = false;
    setResolved({});

    for (const tile of tiles) {
      const key = tileKey(tile);
      rasterizeBasemapTile(tile.z, tile.x, tile.y)
        .then((dataUrl) => {
          if (cancelled) return;
          setResolved((prev) => ({ ...prev, [key]: dataUrl }));
        })
        .catch(() => {
          // Errors reject in rasterizeBasemapTile — no fallback to a remote
          // provider (directive 15). The tile simply never appears in the
          // resolved Record; the caller renders nothing for it.
        });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileSetKey, enabled]);

  return resolved;
}
