// basemap.test.ts — CS-BASEMAP (MARINE-AND-MAPS-PLAN-2026-08-27 §M1/§M3).
//
// Guards src/lib/basemap.ts against the plan's "Lead mechanics — dashboard
// side" design block: BASEMAP_TIERS URLs/zoom ranges, darkBasePaintRules()
// (buildings/landuse/pois dropped, roads replaced by exactly two rules —
// freeway + major_road), labelRulesFor(theme) (places/water only, no road
// shields), and SATELLITE_OUTLINE_PAINT_RULES (the four ADR-078 rules moved
// verbatim from radar-map.tsx:480-520).
//
// Freeway/major_road minzoom+width+colour were RESTYLED (coordinator, lead
// render review 2026-08-27 — freeways were unreadable on the dark
// seismic/radar maps): freeway now applies from z6 (was z7), width
// exp(1.6, [[6,1.4],[8,2.0],[10,2.6],[13,3.4],[15,4.5]]), colour #a0a0a0;
// major_road unchanged minzoom (z>=11), width exp(1.6,[[11,1.0],[15,2.6]]),
// colour #828282 (revised from an initial #6f6f6f ruling, which failed 3:1
// contrast over DARK.water). Every width/colour/minzoom assertion below
// reflects the restyle; "exactly two roads rules" and "major_road rejected
// below z11"
// are the pins the coordinator asked to keep unchanged through the restyle.
//
// Width/zoom-stop assertions use protomaps-leaflet's OWN `exp()` interpolator
// as the independent reference, called here with the plan's literal stop
// arrays (typed independently of src/lib/basemap.ts) — not a rearrangement
// of the implementation's own algebra. `exp()` is a third-party pure
// interpolation utility (KAT mandate targets physical-quantity kernels, not
// UI line-width styling), so this is testing "does basemap.ts use the exact
// stops/base the plan specifies," which is the actual regression risk.
//
// Pre-change failure transcript (run at HEAD 125b642, src/lib/basemap.ts did
// not exist yet):
//
//   $ npx vitest run src/lib/basemap.test.ts
//   FAIL src/lib/basemap.test.ts [ src/lib/basemap.test.ts ]
//   Error: Failed to resolve import "./basemap" from "src/lib/basemap.test.ts".
//   Does the file exist?
//     Plugin: vite:import-analysis
//     File: .../src/lib/basemap.test.ts:40:7
//     6  |    labelRulesFor,
//     7  |    SATELLITE_OUTLINE_PAINT_RULES
//     8  |  } from "./basemap";
//        |          ^
//     9  |  function feature(props) {
//     10 |    return { props };
//    ❯ TransformPluginContext._formatLog .../vite/dist/node/chunks/config.js:29019:43
//    ❯ TransformPluginContext.error .../vite/dist/node/chunks/config.js:29016:14
//    ❯ normalizeUrl .../vite/dist/node/chunks/config.js:27139:18
//    ❯ TransformPluginContext.transform .../vite/dist/node/chunks/config.js:27165:4
//    ❯ loadAndTransform .../vite/dist/node/chunks/config.js:22686:26
//   Test Files  1 failed (1)
//        Tests  no tests

import { describe, it, expect } from 'vitest';
import { exp } from 'protomaps-leaflet';
import type { PaintRule, LabelRule } from 'protomaps-leaflet';
import {
  BASEMAP_TIERS,
  darkBasePaintRules,
  labelRulesFor,
  SATELLITE_OUTLINE_PAINT_RULES,
} from './basemap';

// ---------------------------------------------------------------------------
// Minimal feature stand-ins. PaintRule.filter signature is
// (zoom: number, feature: { props: Record<string, unknown> }) => boolean —
// verified against radar-map.tsx's existing GEO_FEATURES_PAINT_RULES filters
// (:504-518) and protomaps-leaflet's Feature type (src/tilecache.ts).
// ---------------------------------------------------------------------------
function feature(props: Record<string, unknown>): { props: Record<string, unknown> } {
  return { props };
}

/**
 * Whether `rule` actually draws `props` at zoom `z` — combining the rule's
 * `minzoom`/`maxzoom` fields with its `filter`, exactly as protomaps-leaflet's
 * own renderer does (`painter.ts:35-36,82`: `if (rule.minzoom && z <
 * rule.minzoom) continue; if (rule.maxzoom && z > rule.maxzoom) continue;
 * ... if (rule.filter && !rule.filter(z, feature)) continue;`). A zoom
 * threshold ("freeway from z7", "major_road from z11") may be implemented as
 * a `minzoom` field OR as a z-check inside `filter` — both are valid
 * protomaps-leaflet usage (the package's own default style.ts uses the
 * `minzoom` field, not a filter-side z-check, for its analogous road-label
 * zoom thresholds). Calling `rule.filter?.(z, ...)` alone would wrongly fail
 * a correct `minzoom`-based implementation, so every zoom-threshold
 * assertion below goes through this combined check instead.
 */
function ruleApplies(rule: PaintRule, z: number, props: Record<string, unknown>): boolean {
  if (rule.minzoom !== undefined && z < rule.minzoom) return false;
  if (rule.maxzoom !== undefined && z > rule.maxzoom) return false;
  if (rule.filter && !rule.filter(z, feature(props))) return false;
  return true;
}

function widthAt(rule: PaintRule, z: number): number {
  // LineSymbolizer stores width as a NumberAttr; .get(z) resolves both the
  // constant and exp()-function forms (protomaps-leaflet src/attribute.ts:32-37).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rule.symbolizer as any).width.get(z);
}

function colorOf(rule: PaintRule): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rule.symbolizer as any).color.get(0);
}

function opacityOf(rule: PaintRule): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rule.symbolizer as any).opacity.get(0);
}

describe('BASEMAP_TIERS', () => {
  it('world tier covers z0-6 at /api/v1/basemap/world/tiles', () => {
    expect(BASEMAP_TIERS.world.minZoom).toBe(0);
    expect(BASEMAP_TIERS.world.maxZoom).toBe(6);
    expect(BASEMAP_TIERS.world.url).toBe('/api/v1/basemap/world/tiles');
  });

  it('local tier covers z7-15 at /api/v1/basemap/local/tiles', () => {
    expect(BASEMAP_TIERS.local.minZoom).toBe(7);
    expect(BASEMAP_TIERS.local.maxZoom).toBe(15);
    expect(BASEMAP_TIERS.local.url).toBe('/api/v1/basemap/local/tiles');
  });

  it('radar tier covers z0-12 at /api/v1/basemap/radar/tiles', () => {
    expect(BASEMAP_TIERS.radar.minZoom).toBe(0);
    expect(BASEMAP_TIERS.radar.maxZoom).toBe(12);
    expect(BASEMAP_TIERS.radar.url).toBe('/api/v1/basemap/radar/tiles');
  });
});

describe('darkBasePaintRules() — sparse look + freeway/primary roads only', () => {
  const rules = darkBasePaintRules();

  it('drops buildings, landuse, and pois rules entirely', () => {
    const dataLayers = rules.map((r) => r.dataLayer);
    expect(dataLayers).not.toContain('buildings');
    expect(dataLayers).not.toContain('landuse');
    expect(dataLayers).not.toContain('pois');
  });

  it('replaces the flavor roads rules with exactly two', () => {
    const roadsRules = rules.filter((r) => r.dataLayer === 'roads');
    expect(roadsRules).toHaveLength(2);
  });

  describe('freeway rule', () => {
    function freewayRule(): PaintRule {
      const roadsRules = rules.filter((r) => r.dataLayer === 'roads');
      // The freeway rule is the one that actually draws a highway-kind
      // feature at a zoom safely inside its documented z>=7 range —
      // identified by behavior, not array position, since the plan does not
      // fix an order.
      const found = roadsRules.find((r) => ruleApplies(r, 10, { kind: 'highway' }));
      if (!found) throw new Error('no roads rule drew {kind: "highway"} at z10');
      return found;
    }

    // Ruled restyle (coordinator, lead render review 2026-08-27 — freeways
    // were unreadable on the dark seismic/radar maps): freeway now applies
    // from z6 (was z7), new width stops, colour #a0a0a0.
    it('accepts {kind: "highway"} only from z >= 6', () => {
      const rule = freewayRule();
      expect(ruleApplies(rule, 6, { kind: 'highway' })).toBe(true);
      expect(ruleApplies(rule, 15, { kind: 'highway' })).toBe(true);
      expect(ruleApplies(rule, 5, { kind: 'highway' })).toBe(false);
    });

    it('rejects {kind: "minor_road"}', () => {
      const rule = freewayRule();
      expect(ruleApplies(rule, 6, { kind: 'minor_road' })).toBe(false);
      expect(ruleApplies(rule, 15, { kind: 'minor_road' })).toBe(false);
    });

    it('colour is #a0a0a0', () => {
      const rule = freewayRule();
      expect(colorOf(rule)).toBe('#a0a0a0');
    });

    it('width matches exp(1.6, [[6,1.4],[8,2.0],[10,2.6],[13,3.4],[15,4.5]]) at z6/z8/z10/z13/z15', () => {
      const rule = freewayRule();
      const reference = exp(1.6, [[6, 1.4], [8, 2.0], [10, 2.6], [13, 3.4], [15, 4.5]]);
      expect(widthAt(rule, 6)).toBeCloseTo(reference(6), 6);
      expect(widthAt(rule, 8)).toBeCloseTo(reference(8), 6);
      expect(widthAt(rule, 10)).toBeCloseTo(reference(10), 6);
      expect(widthAt(rule, 13)).toBeCloseTo(reference(13), 6);
      expect(widthAt(rule, 15)).toBeCloseTo(reference(15), 6);
    });
  });

  // Contract correction (coordinator, verified against the installed
  // @protomaps/basemaps schema, accepted): the second roads rule filters
  // `kind === 'major_road'` at z >= 11 — `kind_detail === 'primary'` does
  // not exist in the Protomaps roads schema (`kind` values on the `roads`
  // layer are `highway`, `major_road`, `medium_road`, `minor_road`, `path`,
  // `ferry` per docs/reference/pmtiles-protomaps-reference.md:118).
  describe('major_road rule', () => {
    function majorRoadRule(): PaintRule {
      const roadsRules = rules.filter((r) => r.dataLayer === 'roads');
      // Identified at z13 (safely inside the documented z>=11 range) rather
      // than z11 itself, so this finder doesn't depend on the boundary
      // value under test below.
      const found = roadsRules.find((r) => ruleApplies(r, 13, { kind: 'major_road' }));
      if (!found) throw new Error('no roads rule drew {kind: "major_road"} at z13');
      return found;
    }

    it('accepts {kind: "major_road"} only from z >= 11', () => {
      const rule = majorRoadRule();
      expect(ruleApplies(rule, 11, { kind: 'major_road' })).toBe(true);
      expect(ruleApplies(rule, 15, { kind: 'major_road' })).toBe(true);
      expect(ruleApplies(rule, 10, { kind: 'major_road' })).toBe(false);
      expect(ruleApplies(rule, 7, { kind: 'major_road' })).toBe(false);
    });

    it('rejects {kind: "minor_road"} at z >= 11', () => {
      const rule = majorRoadRule();
      expect(ruleApplies(rule, 11, { kind: 'minor_road' })).toBe(false);
    });

    // Ruled restyle (coordinator, lead render review 2026-08-27): new width
    // stops, colour #828282 (not #6f6f6f — that failed 3:1 contrast over
    // DARK.water). minzoom (z>=11) is unchanged — pinned above.
    it('colour is #828282', () => {
      const rule = majorRoadRule();
      expect(colorOf(rule)).toBe('#828282');
    });

    it('width matches exp(1.6, [[11,1.0],[15,2.6]]) at z11/z15', () => {
      const rule = majorRoadRule();
      const reference = exp(1.6, [[11, 1.0], [15, 2.6]]);
      expect(widthAt(rule, 11)).toBeCloseTo(reference(11), 6);
      expect(widthAt(rule, 15)).toBeCloseTo(reference(15), 6);
    });
  });
});

describe('labelRulesFor(theme) — places/water only, no road shields', () => {
  function assertPlacesAndWaterOnly(rules: LabelRule[]) {
    const dataLayers = new Set(rules.map((r) => r.dataLayer));
    for (const layer of dataLayers) {
      expect(['places', 'water']).toContain(layer);
    }
    expect(dataLayers.has('places')).toBe(true);
    expect(dataLayers.has('water')).toBe(true);
    expect(dataLayers.has('roads')).toBe(false);
  }

  it('dark: only places and water label rules', () => {
    assertPlacesAndWaterOnly(labelRulesFor('dark'));
  });

  it('light: only places and water label rules', () => {
    assertPlacesAndWaterOnly(labelRulesFor('light'));
  });
});

describe('SATELLITE_OUTLINE_PAINT_RULES — the four ADR-078 rules moved verbatim', () => {
  it('has exactly four rules', () => {
    expect(SATELLITE_OUTLINE_PAINT_RULES).toHaveLength(4);
  });

  it('has two #ffffff / 1.5 / 0.7 rules (earth + boundaries)', () => {
    const whiteRules = SATELLITE_OUTLINE_PAINT_RULES.filter(
      (r) => colorOf(r) === '#ffffff',
    );
    expect(whiteRules).toHaveLength(2);
    for (const r of whiteRules) {
      expect(widthAt(r, 0)).toBe(1.5);
      expect(opacityOf(r)).toBe(0.7);
    }
    const dataLayers = whiteRules.map((r) => r.dataLayer).sort();
    expect(dataLayers).toEqual(['boundaries', 'earth']);
  });

  it('roads rule: #999999 / 1 / 0.5, filter accepts highway|major_road, rejects other kinds', () => {
    const roadsRule = SATELLITE_OUTLINE_PAINT_RULES.find((r) => r.dataLayer === 'roads');
    expect(roadsRule).toBeDefined();
    if (!roadsRule) return;
    expect(colorOf(roadsRule)).toBe('#999999');
    expect(widthAt(roadsRule, 0)).toBe(1);
    expect(opacityOf(roadsRule)).toBe(0.5);
    expect(roadsRule.filter?.(0, feature({ kind: 'highway' }))).toBe(true);
    expect(roadsRule.filter?.(0, feature({ kind: 'major_road' }))).toBe(true);
    expect(roadsRule.filter?.(0, feature({ kind: 'minor_road' }))).toBe(false);
  });

  it('water rule: #4a90d9 / 1 / 0.6, filter rejects ocean, accepts non-ocean', () => {
    const waterRule = SATELLITE_OUTLINE_PAINT_RULES.find((r) => r.dataLayer === 'water');
    expect(waterRule).toBeDefined();
    if (!waterRule) return;
    expect(colorOf(waterRule)).toBe('#4a90d9');
    expect(widthAt(waterRule, 0)).toBe(1);
    expect(opacityOf(waterRule)).toBe(0.6);
    expect(waterRule.filter?.(0, feature({ kind: 'ocean' }))).toBe(false);
    expect(waterRule.filter?.(0, feature({ kind: 'lake' }))).toBe(true);
  });
});
