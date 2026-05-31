/**
 * weather-icon.test.tsx — Unit tests for WeatherIcon (ADR-049 acceptance criteria).
 *
 * Coverage:
 *   - All 29 WMO codes render a glyph (no null / empty render).
 *   - Night flag: code 0 isNight=true renders the moon glyph (bedtime).
 *   - Night flag: non-zero code isNight=true still renders the day glyph.
 *   - Screen-reader label (sr-only span) is present for every mapped code.
 *   - Null / unknown codes render nothing.
 *   - Size prop: numeric and CSS-string variants resolve correctly.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { WeatherIcon } from './weather-icon';

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

/** All 29 WMO codes the component maps (from the WMO_MAP in weather-icon.tsx). */
const ALL_WMO_CODES = [
  0, 1, 2, 3,
  45, 48,
  51, 53, 55, 56, 57,
  61, 63, 65, 66, 67,
  71, 73, 75, 77,
  80, 81, 82,
  85, 86,
  95, 96, 99,
] as const;

// ---------------------------------------------------------------------------
// Suite: all 29 codes render a glyph
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
    expect(paths[0].getAttribute('fill')).toBe('url(#goldGrad)');
  });

  it('code 0 isNight=true renders the moon (bedtime) SVG (moonGrad fill)', () => {
    const { container } = render(<WeatherIcon code={0} isNight={true} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const paths = svg!.querySelectorAll('path');
    expect(paths.length).toBe(1);
    expect(paths[0].getAttribute('fill')).toBe('url(#moonGrad)');
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
    const grad = container.querySelector('#goldGrad');
    expect(grad).not.toBeNull();
  });

  it('greyGrad linearGradient is present', () => {
    const { container } = render(<WeatherIcon code={3} />);
    expect(container.querySelector('#greyGrad')).not.toBeNull();
  });

  it('rainGrad linearGradient is present in rainy glyph', () => {
    const { container } = render(<WeatherIcon code={61} />);
    expect(container.querySelector('#rainGrad')).not.toBeNull();
  });

  it('snowGrad linearGradient is present in snowy glyph', () => {
    const { container } = render(<WeatherIcon code={71} />);
    expect(container.querySelector('#snowGrad')).not.toBeNull();
  });

  it('moonGrad linearGradient is present in bedtime glyph', () => {
    const { container } = render(<WeatherIcon code={0} isNight />);
    expect(container.querySelector('#moonGrad')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: gradient stop values (locked palette — ADR-049)
// ---------------------------------------------------------------------------

describe('WeatherIcon — locked gradient stop values', () => {
  it('goldGrad stops are #FFD24D and #F5A623', () => {
    const { container } = render(<WeatherIcon code={0} />);
    const grad = container.querySelector('#goldGrad');
    const stops = grad!.querySelectorAll('stop');
    expect(stops[0].getAttribute('stop-color')).toBe('#FFD24D');
    expect(stops[1].getAttribute('stop-color')).toBe('#F5A623');
  });

  it('greyGrad stops are #F3F5F8 and #C7CDD6', () => {
    const { container } = render(<WeatherIcon code={3} />);
    const grad = container.querySelector('#greyGrad');
    const stops = grad!.querySelectorAll('stop');
    expect(stops[0].getAttribute('stop-color')).toBe('#F3F5F8');
    expect(stops[1].getAttribute('stop-color')).toBe('#C7CDD6');
  });

  it('rainGrad stops are #9CCEF5 and #5BA3DC', () => {
    const { container } = render(<WeatherIcon code={61} />);
    const grad = container.querySelector('#rainGrad');
    const stops = grad!.querySelectorAll('stop');
    expect(stops[0].getAttribute('stop-color')).toBe('#9CCEF5');
    expect(stops[1].getAttribute('stop-color')).toBe('#5BA3DC');
  });

  it('snowGrad stops are #E8F4FF and #B8D8F5', () => {
    const { container } = render(<WeatherIcon code={71} />);
    const grad = container.querySelector('#snowGrad');
    const stops = grad!.querySelectorAll('stop');
    expect(stops[0].getAttribute('stop-color')).toBe('#E8F4FF');
    expect(stops[1].getAttribute('stop-color')).toBe('#B8D8F5');
  });

  it('moonGrad stops are #86C3DB and #72B9D5', () => {
    const { container } = render(<WeatherIcon code={0} isNight />);
    const grad = container.querySelector('#moonGrad');
    const stops = grad!.querySelectorAll('stop');
    expect(stops[0].getAttribute('stop-color')).toBe('#86C3DB');
    expect(stops[1].getAttribute('stop-color')).toBe('#72B9D5');
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
    expect(svgPaths[0].getAttribute('fill')).toBe('url(#greyGrad)');
  });

  it('code 1 second path uses goldGrad (sun)', () => {
    const { container } = render(<WeatherIcon code={1} />);
    const svgPaths = container.querySelector('svg')!.querySelectorAll('path');
    expect(svgPaths[1].getAttribute('fill')).toBe('url(#goldGrad)');
  });

  it('code 1 both paths have fill-rule="nonzero"', () => {
    const { container } = render(<WeatherIcon code={1} />);
    const svgPaths = container.querySelector('svg')!.querySelectorAll('path');
    expect(svgPaths[0].getAttribute('fill-rule')).toBe('nonzero');
    expect(svgPaths[1].getAttribute('fill-rule')).toBe('nonzero');
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
