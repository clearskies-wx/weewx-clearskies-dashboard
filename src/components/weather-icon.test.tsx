/**
 * weather-icon.test.tsx — Unit tests for WeatherIcon (ADR-049 acceptance criteria).
 *
 * Coverage:
 *   - All 44 WMO codes (including Clear Skies API extension codes 4, 5, 10,
 *     79 and WMO extension codes 6/7/8, plus internal compound codes
 *     100-108 added in T4.8 for the icon system overhaul) render a glyph
 *     (no null / empty render).
 *   - Night flag: code 0 isNight=true renders the moon glyph (bedtime).
 *   - Night flag: non-zero code isNight=true still renders the day glyph.
 *   - Screen-reader label (sr-only span) is present for every mapped code.
 *   - Null / unknown codes render nothing.
 *   - Size prop: numeric and CSS-string variants resolve correctly.
 *   - toWmoCode() normalises NWS shortnames, OWM condition IDs, and Aeris
 *     atmosphere codes to WMO numbers.
 *
 * Gradient IDs note: weather-icon-glyphs.tsx scopes every gradient/clipPath
 * id with a useId()-generated prefix (e.g. `:r0:goldGrad`) to avoid
 * collisions across multiple icon instances in the same document (hidden
 * forecast tab panels). Tests below select by id suffix (`[id$="goldGrad"]`)
 * or assert the resolved fill/url() string contains the gradient name,
 * rather than matching a fixed id.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { WeatherIcon } from './weather-icon';
import { toWmoCode } from '../utils/weather-code';

// ---------------------------------------------------------------------------
// Mock react-i18next — the component calls useTranslation('weather').
// The mock returns the key itself as the translation so tests can verify
// descriptionKey presence without loading locale JSON.
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * All 44 WMO codes the component maps (from the WMO_MAP in weather-icon.tsx),
 * including:
 *   - Clear Skies API extension codes: 4 (overcast/heavy overcast),
 *     5 (haze), 10 (mist), and 79 (ice pellets/sleet).
 *   - WMO extension codes added in T4.8: 6 (smoke), 7 (dust),
 *     8 (volcanic ash).
 *   - Internal compound codes (not WMO codes) added in T4.8, returned by
 *     selectWeatherIcon(): 100 (mostly cloudy), 101-103 (combined sky +
 *     rain/snow/wintry-mix), 104-105 (haze partly-cloudy/overcast),
 *     106-107 (smoke partly-cloudy/overcast, also used for ash),
 *     108 (dust overcast).
 */
const ALL_WMO_CODES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8,
  10,
  45, 48,
  51, 53, 55, 56, 57,
  61, 63, 65, 66, 67,
  71, 73, 75, 77, 79,
  80, 81, 82,
  85, 86,
  95, 96, 99,
  100, 101, 102, 103, 104, 105, 106, 107, 108,
] as const;

// ---------------------------------------------------------------------------
// Suite: all 44 codes render a glyph
// ---------------------------------------------------------------------------

describe('WeatherIcon — all WMO codes render a glyph', () => {
  it.each(ALL_WMO_CODES)(
    'code %i renders an SVG element (not null)',
    (code) => {
      const { container } = render(<WeatherIcon code={code} />);
      const svg = container.querySelector('svg');
      expect(svg, `code ${code} must render an <svg>`).not.toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// Suite: sr-only label is present for all mapped codes
// ---------------------------------------------------------------------------

describe('WeatherIcon — sr-only label present', () => {
  it.each(ALL_WMO_CODES)(
    'code %i has a sr-only span with the wmo.%i description key',
    (code) => {
      const { container } = render(<WeatherIcon code={code} />);
      const srSpan = container.querySelector('.sr-only');
      expect(srSpan, `code ${code} must have a .sr-only span`).not.toBeNull();
      // The mock t() returns the key verbatim, so text is e.g. "wmo.0"
      expect(srSpan!.textContent).toBe(`wmo.${code}`);
    },
  );
});

// ---------------------------------------------------------------------------
// Suite: night handling
// ---------------------------------------------------------------------------

describe('WeatherIcon — night handling', () => {
  it('code 0 isNight=false renders the sunny SVG (goldGrad fill)', () => {
    const { container } = render(<WeatherIcon code={0} isNight={false} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // The sunny glyph uses goldGrad; partly-cloudy and others also use goldGrad
    // but the distinguishing check is that ALL paths use goldGrad (single-path sunny).
    const paths = svg!.querySelectorAll('path');
    expect(paths.length).toBe(1);
    // Gradient id is scoped with a useId() prefix (e.g. `:r0:goldGrad`), so
    // assert the resolved fill url() contains the gradient name.
    expect(paths[0].getAttribute('fill')).toContain('goldGrad');
  });

  it('code 0 isNight=true renders the moon (bedtime) SVG (moonGrad fill)', () => {
    const { container } = render(<WeatherIcon code={0} isNight={true} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const paths = svg!.querySelectorAll('path');
    expect(paths.length).toBe(1);
    expect(paths[0].getAttribute('fill')).toContain('moonGrad');
  });

  it('code 1 isNight=true still renders the partly-cloudy glyph (no night override)', () => {
    const { container } = render(<WeatherIcon code={1} isNight={true} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // Partly-cloudy has exactly 2 paths (grey cloud + gold sun)
    const paths = svg!.querySelectorAll('path');
    expect(paths.length).toBe(2);
  });

  it('code 95 isNight=true still renders the thunderstorm glyph (no night override)', () => {
    const { container } = render(<WeatherIcon code={95} isNight={true} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // Thunderstorm has exactly 2 paths (grey cloud + gold bolts)
    const paths = svg!.querySelectorAll('path');
    expect(paths.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Suite: null / unknown codes render nothing
// ---------------------------------------------------------------------------

describe('WeatherIcon — null / unknown codes', () => {
  it('code=null renders nothing', () => {
    const { container } = render(<WeatherIcon code={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('code=999 (unknown) renders nothing', () => {
    const { container } = render(<WeatherIcon code={999} />);
    expect(container.firstChild).toBeNull();
  });

  it('code="bad" (unparseable string) renders nothing', () => {
    const { container } = render(<WeatherIcon code="bad" />);
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: string-form code (consumers may pass string)
// ---------------------------------------------------------------------------

describe('WeatherIcon — string code input', () => {
  it('code="0" (string) renders the sunny SVG', () => {
    const { container } = render(<WeatherIcon code="0" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('code="61" (string) renders a glyph', () => {
    const { container } = render(<WeatherIcon code="61" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: size prop
// ---------------------------------------------------------------------------

describe('WeatherIcon — size prop', () => {
  it('numeric size sets SVG width/height attributes', () => {
    const { container } = render(<WeatherIcon code={0} size={24} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('width')).toBe('24');
    expect(svg!.getAttribute('height')).toBe('24');
  });

  it('CSS string size "56px" resolves to 56 for SVG width/height', () => {
    const { container } = render(<WeatherIcon code={0} size="56px" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('width')).toBe('56');
    expect(svg!.getAttribute('height')).toBe('56');
  });

  it('CSS string "48px" resolves to 48', () => {
    const { container } = render(<WeatherIcon code={3} size="48px" />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('width')).toBe('48');
  });

  it('no size prop defaults to 96', () => {
    const { container } = render(<WeatherIcon code={0} />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('width')).toBe('96');
  });
});

// ---------------------------------------------------------------------------
// Suite: gradient defs present in every SVG
// ---------------------------------------------------------------------------

describe('WeatherIcon — gradient defs', () => {
  beforeAll(() => {
    // Ensure vi.mock is in effect (already applied above).
  });

  it('every SVG contains a <defs> block', () => {
    for (const code of ALL_WMO_CODES) {
      const { container } = render(<WeatherIcon code={code} />);
      const defs = container.querySelector('defs');
      expect(defs, `code ${code} SVG must contain <defs>`).not.toBeNull();
    }
  });

  it('goldGrad linearGradient is present in the defs', () => {
    const { container } = render(<WeatherIcon code={0} />);
    const grad = container.querySelector('[id$="goldGrad"]');
    expect(grad).not.toBeNull();
  });

  it('greyGrad linearGradient is present', () => {
    const { container } = render(<WeatherIcon code={3} />);
    expect(container.querySelector('[id$="greyGrad"]')).not.toBeNull();
  });

  it('rainGrad linearGradient is present in rainy glyph', () => {
    const { container } = render(<WeatherIcon code={61} />);
    expect(container.querySelector('[id$="rainGrad"]')).not.toBeNull();
  });

  it('snowGrad linearGradient is present in snowy glyph', () => {
    const { container } = render(<WeatherIcon code={71} />);
    expect(container.querySelector('[id$="snowGrad"]')).not.toBeNull();
  });

  it('moonGrad linearGradient is present in bedtime glyph', () => {
    const { container } = render(<WeatherIcon code={0} isNight />);
    expect(container.querySelector('[id$="moonGrad"]')).not.toBeNull();
  });

  it('smokeGrad linearGradient is present in smoke glyph', () => {
    const { container } = render(<WeatherIcon code={6} />);
    expect(container.querySelector('[id$="smokeGrad"]')).not.toBeNull();
  });

  it('dustGrad linearGradient is present in dust glyph', () => {
    const { container } = render(<WeatherIcon code={7} />);
    expect(container.querySelector('[id$="dustGrad"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: gradient stop values (locked palette — ADR-049)
// ---------------------------------------------------------------------------

describe('WeatherIcon — locked gradient stop values', () => {
  it('goldGrad stops are #FFD24D and #F5A623', () => {
    const { container } = render(<WeatherIcon code={0} />);
    const grad = container.querySelector('[id$="goldGrad"]');
    const stops = grad!.querySelectorAll('stop');
    expect(stops[0].getAttribute('stop-color')).toBe('#FFD24D');
    expect(stops[1].getAttribute('stop-color')).toBe('#F5A623');
  });

  it('greyGrad stops are #F3F5F8 and #C7CDD6', () => {
    const { container } = render(<WeatherIcon code={3} />);
    const grad = container.querySelector('[id$="greyGrad"]');
    const stops = grad!.querySelectorAll('stop');
    expect(stops[0].getAttribute('stop-color')).toBe('#F3F5F8');
    expect(stops[1].getAttribute('stop-color')).toBe('#C7CDD6');
  });

  it('rainGrad stops are #9CCEF5 and #5BA3DC', () => {
    const { container } = render(<WeatherIcon code={61} />);
    const grad = container.querySelector('[id$="rainGrad"]');
    const stops = grad!.querySelectorAll('stop');
    expect(stops[0].getAttribute('stop-color')).toBe('#9CCEF5');
    expect(stops[1].getAttribute('stop-color')).toBe('#5BA3DC');
  });

  it('snowGrad stops are #E8F4FF and #B8D8F5', () => {
    const { container } = render(<WeatherIcon code={71} />);
    const grad = container.querySelector('[id$="snowGrad"]');
    const stops = grad!.querySelectorAll('stop');
    expect(stops[0].getAttribute('stop-color')).toBe('#E8F4FF');
    expect(stops[1].getAttribute('stop-color')).toBe('#B8D8F5');
  });

  it('moonGrad stops are #86C3DB and #72B9D5', () => {
    const { container } = render(<WeatherIcon code={0} isNight />);
    const grad = container.querySelector('[id$="moonGrad"]');
    const stops = grad!.querySelectorAll('stop');
    expect(stops[0].getAttribute('stop-color')).toBe('#86C3DB');
    expect(stops[1].getAttribute('stop-color')).toBe('#72B9D5');
  });

  it('smokeGrad stops are #9EA5AD and #6B7280', () => {
    const { container } = render(<WeatherIcon code={6} />);
    const grad = container.querySelector('[id$="smokeGrad"]');
    const stops = grad!.querySelectorAll('stop');
    expect(stops[0].getAttribute('stop-color')).toBe('#9EA5AD');
    expect(stops[1].getAttribute('stop-color')).toBe('#6B7280');
  });

  it('dustGrad stops are #D4A574 and #A0734A', () => {
    const { container } = render(<WeatherIcon code={7} />);
    const grad = container.querySelector('[id$="dustGrad"]');
    const stops = grad!.querySelectorAll('stop');
    expect(stops[0].getAttribute('stop-color')).toBe('#D4A574');
    expect(stops[1].getAttribute('stop-color')).toBe('#A0734A');
  });
});

// ---------------------------------------------------------------------------
// Suite: partly-cloudy gotcha — both paths present, correct fills
// ---------------------------------------------------------------------------

describe('WeatherIcon — partly-cloudy split paths', () => {
  it('code 1 renders exactly 2 paths (cloud + sun)', () => {
    const { container } = render(<WeatherIcon code={1} />);
    // 2 paths inside the SVG (defs linearGradient stops are not paths)
    const svgPaths = container.querySelector('svg')!.querySelectorAll('path');
    expect(svgPaths.length).toBe(2);
  });

  it('code 1 first path uses greyGrad (cloud)', () => {
    const { container } = render(<WeatherIcon code={1} />);
    const svgPaths = container.querySelector('svg')!.querySelectorAll('path');
    expect(svgPaths[0].getAttribute('fill')).toContain('greyGrad');
  });

  it('code 1 second path uses goldGrad (sun)', () => {
    const { container } = render(<WeatherIcon code={1} />);
    const svgPaths = container.querySelector('svg')!.querySelectorAll('path');
    expect(svgPaths[1].getAttribute('fill')).toContain('goldGrad');
  });

  it('code 1 both paths have fill-rule="nonzero"', () => {
    const { container } = render(<WeatherIcon code={1} />);
    const svgPaths = container.querySelector('svg')!.querySelectorAll('path');
    expect(svgPaths[0].getAttribute('fill-rule')).toBe('nonzero');
    expect(svgPaths[1].getAttribute('fill-rule')).toBe('nonzero');
  });
});

// ---------------------------------------------------------------------------
// Suite: new-glyph composition (T4.1-T4.8 icon system overhaul)
// ---------------------------------------------------------------------------

describe('WeatherIcon — drizzle uses round dots, not rain streaks', () => {
  it('code 51 (drizzle) renders 4 circle drops and no rect rain-streaks', () => {
    const { container } = render(<WeatherIcon code={51} />);
    const svg = container.querySelector('svg')!;
    expect(svg.querySelectorAll('circle').length).toBe(4);
    expect(svg.querySelectorAll('rect').length).toBe(0);
  });
});

describe('WeatherIcon — wintry mix composition (rain streaks + snow dots)', () => {
  it('code 79 (ice pellets/sleet) renders both rain-streak rects and snow-dot circles', () => {
    const { container } = render(<WeatherIcon code={79} />);
    const svg = container.querySelector('svg')!;
    expect(svg.querySelectorAll('rect').length).toBe(2);
    expect(svg.querySelectorAll('circle').length).toBe(3);
  });
});

describe('WeatherIcon — mostly cloudy (compound code 100)', () => {
  it('code 100 day renders a scaled <g transform> sun path behind the overcast cloud', () => {
    const { container } = render(<WeatherIcon code={100} isNight={false} />);
    const svg = container.querySelector('svg')!;
    const g = svg.querySelector('g[transform]');
    expect(g, 'must have a <g transform> wrapping the celestial body').not.toBeNull();
    expect(g!.getAttribute('transform')).toContain('scale(0.55)');
    const scaledPath = g!.querySelector('path');
    expect(scaledPath).not.toBeNull();
    expect(scaledPath!.getAttribute('fill')).toContain('goldGrad');
    // The overcast cloud path renders as a direct child of <svg> (outside
    // the scaled <g>), after it in document order.
    const directPaths = Array.from(svg.children).filter((el) => el.tagName === 'path');
    expect(directPaths.length).toBe(1);
    expect(directPaths[0].getAttribute('fill')).toContain('greyGrad');
  });

  it('code 100 isNight=true renders GlyphMostlyCloudyNight (moonGrad in the scaled group)', () => {
    const { container } = render(<WeatherIcon code={100} isNight={true} />);
    const svg = container.querySelector('svg')!;
    const g = svg.querySelector('g[transform]');
    expect(g).not.toBeNull();
    const scaledPath = g!.querySelector('path');
    expect(scaledPath!.getAttribute('fill')).toContain('moonGrad');
  });
});

describe('WeatherIcon — smoke overlay (base icon stays intact, smoke is additive)', () => {
  it('code 6 day renders the base sunny icon plus 4 smoke bubble circles', () => {
    const { container } = render(<WeatherIcon code={6} isNight={false} />);
    const svg = container.querySelector('svg')!;
    const basePath = svg.querySelector('path');
    expect(basePath!.getAttribute('fill')).toContain('goldGrad');
    const smokeCircles = Array.from(svg.querySelectorAll('circle')).filter((c) =>
      c.getAttribute('fill')?.includes('smokeGrad'),
    );
    expect(smokeCircles.length).toBe(4);
  });

  it('code 6 isNight=true renders GlyphSmokeNight (moonGrad base) plus smoke bubbles', () => {
    const { container } = render(<WeatherIcon code={6} isNight={true} />);
    const svg = container.querySelector('svg')!;
    const basePath = svg.querySelector('path');
    expect(basePath!.getAttribute('fill')).toContain('moonGrad');
    const smokeCircles = Array.from(svg.querySelectorAll('circle')).filter((c) =>
      c.getAttribute('fill')?.includes('smokeGrad'),
    );
    expect(smokeCircles.length).toBe(4);
  });
});

describe('WeatherIcon — dust standalone (dust dominant, celestial body secondary)', () => {
  it('code 7 day renders a small scaled <g transform> celestial body plus 5 dust particle circles', () => {
    const { container } = render(<WeatherIcon code={7} isNight={false} />);
    const svg = container.querySelector('svg')!;
    const g = svg.querySelector('g[transform]');
    expect(g, 'must have a <g transform> wrapping the small celestial body').not.toBeNull();
    expect(g!.getAttribute('transform')).toContain('scale(0.45)');
    const dustCircles = Array.from(svg.querySelectorAll('circle')).filter((c) =>
      c.getAttribute('fill')?.includes('dustGrad'),
    );
    expect(dustCircles.length).toBe(5);
  });
});

describe('WeatherIcon — haze cloud-cover clip technique', () => {
  it('code 104 (haze, partly cloudy) renders a clipPath clipping the sky group', () => {
    const { container } = render(<WeatherIcon code={104} />);
    const svg = container.querySelector('svg')!;
    expect(svg.querySelector('clipPath')).not.toBeNull();
    expect(svg.querySelector('g[clip-path]')).not.toBeNull();
  });
});

describe('WeatherIcon — combined sky + precipitation composition', () => {
  it('code 101 (partly cloudy + rain) day renders the scaled sky group and rain-streak rects', () => {
    const { container } = render(<WeatherIcon code={101} isNight={false} />);
    const svg = container.querySelector('svg')!;
    const g = svg.querySelector('g[transform]');
    expect(g, 'must have a <g transform> wrapping the scaled cloud+sun').not.toBeNull();
    expect(g!.getAttribute('transform')).toContain('scale(0.8)');
    // Cloud + sun paths inside the scaled group
    expect(g!.querySelectorAll('path').length).toBe(2);
    // 3 rain-streak rects outside the scaled group
    expect(svg.querySelectorAll('rect').length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Suite: SVG a11y attributes (rules/coding.md §5.5)
// ---------------------------------------------------------------------------

describe('WeatherIcon — SVG a11y attributes', () => {
  it('inner SVG is aria-hidden', () => {
    const { container } = render(<WeatherIcon code={0} />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
  });

  it('inner SVG is focusable="false"', () => {
    const { container } = render(<WeatherIcon code={0} />);
    const svg = container.querySelector('svg');
    expect(svg!.getAttribute('focusable')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// Suite: toWmoCode() — NWS forecast icon shortname mapping
// ---------------------------------------------------------------------------

describe('toWmoCode — NWS shortname mapping', () => {
  it('maps "ra" to 61 (rain)', () => {
    expect(toWmoCode('ra')).toBe(61);
  });

  it('maps "sct" to 2 (scattered clouds)', () => {
    expect(toWmoCode('sct')).toBe(2);
  });

  it('maps "smoke" to 6', () => {
    expect(toWmoCode('smoke')).toBe(6);
  });

  it('maps "dust" to 7', () => {
    expect(toWmoCode('dust')).toBe(7);
  });

  it('maps "haze" to 5', () => {
    expect(toWmoCode('haze')).toBe(5);
  });

  it('maps "tsra" to 95 (thunderstorm)', () => {
    expect(toWmoCode('tsra')).toBe(95);
  });

  it('maps "fzra" to 66 (freezing rain)', () => {
    expect(toWmoCode('fzra')).toBe(66);
  });

  it('maps compound "sct/smoke" to 6 (smoke wins over sky)', () => {
    expect(toWmoCode('sct/smoke')).toBe(6);
  });

  it('maps "fg/ovc" to 45 (fog)', () => {
    expect(toWmoCode('fg/ovc')).toBe(45);
  });

  it('resolves literal "wind_sct" shortname to 2', () => {
    expect(toWmoCode('wind_sct')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Suite: toWmoCode() — OpenWeatherMap condition ID mapping
// ---------------------------------------------------------------------------

describe('toWmoCode — OWM condition ID mapping', () => {
  it('maps 500 (light rain) to 61', () => {
    expect(toWmoCode(500)).toBe(61);
  });

  it('maps 711 (smoke) to 6', () => {
    expect(toWmoCode(711)).toBe(6);
  });

  it('maps 721 (haze) to 5', () => {
    expect(toWmoCode(721)).toBe(5);
  });

  it('maps 731 (dust) to 7', () => {
    expect(toWmoCode(731)).toBe(7);
  });

  it('maps 800 (clear) to 0', () => {
    expect(toWmoCode(800)).toBe(0);
  });

  it('maps 804 (overcast) to 3', () => {
    expect(toWmoCode(804)).toBe(3);
  });

  it('maps 200 (thunderstorm) to 95', () => {
    expect(toWmoCode(200)).toBe(95);
  });

  it('maps string "500" to 61', () => {
    expect(toWmoCode('500')).toBe(61);
  });

  it('maps 762 (volcanic ash) to 8', () => {
    expect(toWmoCode(762)).toBe(8);
  });

  it('returns null for unknown OWM code 999', () => {
    expect(toWmoCode(999)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: toWmoCode() — Aeris atmosphere codes
// ---------------------------------------------------------------------------

describe('toWmoCode — Aeris atmosphere codes', () => {
  it('maps "::K" to 6 (smoke)', () => {
    expect(toWmoCode('::K')).toBe(6);
  });

  it('maps "::BD" to 7 (blowing dust)', () => {
    expect(toWmoCode('::BD')).toBe(7);
  });

  it('maps "::H" to 5 (haze)', () => {
    expect(toWmoCode('::H')).toBe(5);
  });

  it('maps "::VA" to 8 (volcanic ash)', () => {
    expect(toWmoCode('::VA')).toBe(8);
  });

  it('maps "::WM" to 79 (wintry mix)', () => {
    expect(toWmoCode('::WM')).toBe(79);
  });
});

// ---------------------------------------------------------------------------
// Suite: toWmoCode() — edge cases
// ---------------------------------------------------------------------------

describe('toWmoCode — edge cases', () => {
  it('returns null for empty string', () => {
    expect(toWmoCode('')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(toWmoCode(undefined)).toBeNull();
  });

  it('passes through WMO codes 0-99 unchanged', () => {
    expect(toWmoCode(0)).toBe(0);
    expect(toWmoCode(45)).toBe(45);
    expect(toWmoCode(95)).toBe(95);
  });
});
