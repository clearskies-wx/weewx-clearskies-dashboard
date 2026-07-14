/**
 * weather-icon.test.tsx — Unit tests for WeatherIcon (ADR-049 acceptance criteria).
 *
 * Coverage:
 *   - All 44 WMO codes (including Clear Skies API extension codes 4, 5, 10,
 *     79 and WMO extension codes 6/7/8, plus internal compound codes
 *     100-108 added in T4.8 for the icon system overhaul) render an <img>
 *     glyph (no null / empty render), pointing at the correct
 *     `/icons/*.svg` file.
 *   - Night flag: code 0 isNight=true renders the moon glyph (clear-night.svg).
 *   - Night flag: non-zero code isNight=true still renders the day glyph
 *     where no dedicated night variant exists.
 *   - Screen-reader label (sr-only span) is present for every mapped code.
 *   - Null / unknown codes render nothing.
 *   - Size prop: numeric and CSS-string variants resolve correctly.
 *   - toWmoCode() normalises NWS shortnames, OWM condition IDs, and Aeris
 *     atmosphere codes to WMO numbers.
 *
 * Rendering model note: each glyph component in weather-icon-glyphs.tsx is a
 * thin wrapper around <img src="/icons/<name>.svg">. The .svg files are
 * hand-authored in Illustrator (docs/design/icons/) and served as static
 * assets from public/icons/ — there is no in-DOM path/gradient composition
 * to assert on any more, so these tests verify the WMO-code → file mapping
 * and the img's accessibility attributes instead.
 */

import { describe, it, expect, vi } from 'vitest';
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

/** Day-glyph file for each mapped code (icons/<name>.svg, no directory prefix). */
const DAY_ICON_FILE: Record<number, string> = {
  0: 'clear-day.svg',
  1: 'partly-cloudy-day.svg',
  2: 'partly-cloudy-day.svg',
  3: 'overcast.svg',
  4: 'overcast.svg',
  5: 'haze-clear-day.svg',
  6: 'smoke-clear-day.svg',
  7: 'dust-day.svg',
  8: 'smoke-clear-day.svg',
  10: 'fog.svg',
  45: 'fog.svg',
  48: 'fog.svg',
  51: 'drizzle.svg',
  53: 'drizzle.svg',
  55: 'drizzle.svg',
  56: 'wintry-mix.svg',
  57: 'wintry-mix.svg',
  61: 'rain.svg',
  63: 'rain.svg',
  65: 'rain.svg',
  66: 'wintry-mix.svg',
  67: 'wintry-mix.svg',
  71: 'snow.svg',
  73: 'snow.svg',
  75: 'snow.svg',
  77: 'snow.svg',
  79: 'wintry-mix.svg',
  80: 'rain.svg',
  81: 'rain.svg',
  82: 'rain.svg',
  85: 'snow.svg',
  86: 'snow.svg',
  95: 'thunderstorm.svg',
  96: 'thunderstorm.svg',
  99: 'thunderstorm.svg',
  100: 'mostly-cloudy-day.svg',
  101: 'partly-cloudy-rain-day.svg',
  102: 'partly-cloudy-snow-day.svg',
  103: 'partly-cloudy-mix-day.svg',
  104: 'haze-partly-cloudy-day.svg',
  105: 'haze-overcast.svg',
  106: 'smoke-partly-cloudy-day.svg',
  107: 'smoke-overcast.svg',
  108: 'dust-overcast.svg',
};

/** Night-glyph file for codes with a dedicated night variant; undefined = falls back to day. */
const NIGHT_ICON_FILE: Partial<Record<number, string>> = {
  0: 'clear-night.svg',
  1: 'partly-cloudy-night.svg',
  2: 'partly-cloudy-night.svg',
  5: 'haze-clear-night.svg',
  6: 'smoke-clear-night.svg',
  7: 'dust-night.svg',
  8: 'smoke-clear-night.svg',
  100: 'mostly-cloudy-night.svg',
  101: 'partly-cloudy-rain-night.svg',
  102: 'partly-cloudy-snow-night.svg',
  103: 'partly-cloudy-mix-night.svg',
  104: 'haze-partly-cloudy-night.svg',
  106: 'smoke-partly-cloudy-night.svg',
};

/** Read the icon filename (basename) out of an <img>'s src attribute. */
function iconFileFromImg(img: HTMLImageElement): string {
  const src = img.getAttribute('src') ?? '';
  return src.replace(/^\/icons\//, '');
}

// ---------------------------------------------------------------------------
// Suite: all 44 codes render the correct glyph file
// ---------------------------------------------------------------------------

describe('WeatherIcon — all WMO codes render an <img> glyph', () => {
  it.each(ALL_WMO_CODES)('code %i renders an <img> (not null)', (code) => {
    const { container } = render(<WeatherIcon code={code} />);
    const img = container.querySelector('img');
    expect(img, `code ${code} must render an <img>`).not.toBeNull();
  });

  it.each(ALL_WMO_CODES)('code %i day renders the expected icon file', (code) => {
    const { container } = render(<WeatherIcon code={code} isNight={false} />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(iconFileFromImg(img)).toBe(DAY_ICON_FILE[code]);
  });
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
  it('code 0 isNight=false renders clear-day.svg', () => {
    const { container } = render(<WeatherIcon code={0} isNight={false} />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(iconFileFromImg(img)).toBe('clear-day.svg');
  });

  it('code 0 isNight=true renders clear-night.svg (bedtime moon)', () => {
    const { container } = render(<WeatherIcon code={0} isNight={true} />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(iconFileFromImg(img)).toBe('clear-night.svg');
  });

  it('code 1 isNight=true renders the dedicated partly-cloudy-night glyph', () => {
    const { container } = render(<WeatherIcon code={1} isNight={true} />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(iconFileFromImg(img)).toBe('partly-cloudy-night.svg');
  });

  it('code 95 isNight=true still renders the thunderstorm glyph (no night override)', () => {
    const { container } = render(<WeatherIcon code={95} isNight={true} />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(iconFileFromImg(img)).toBe('thunderstorm.svg');
  });

  it.each(
    Object.entries(NIGHT_ICON_FILE).map(([code, file]) => [Number(code), file] as const),
  )('code %i isNight=true renders %s', (code, file) => {
    const { container } = render(<WeatherIcon code={code} isNight={true} />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(iconFileFromImg(img)).toBe(file);
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
  it('code="0" (string) renders clear-day.svg', () => {
    const { container } = render(<WeatherIcon code="0" />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(iconFileFromImg(img)).toBe('clear-day.svg');
  });

  it('code="61" (string) renders a glyph', () => {
    const { container } = render(<WeatherIcon code="61" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: size prop
// ---------------------------------------------------------------------------

describe('WeatherIcon — size prop', () => {
  it('numeric size sets img width/height attributes', () => {
    const { container } = render(<WeatherIcon code={0} size={24} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('width')).toBe('24');
    expect(img!.getAttribute('height')).toBe('24');
  });

  it('CSS string size "56px" resolves to 56 for img width/height', () => {
    const { container } = render(<WeatherIcon code={0} size="56px" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('width')).toBe('56');
    expect(img!.getAttribute('height')).toBe('56');
  });

  it('CSS string "48px" resolves to 48', () => {
    const { container } = render(<WeatherIcon code={3} size="48px" />);
    const img = container.querySelector('img');
    expect(img!.getAttribute('width')).toBe('48');
  });

  it('no size prop defaults to 96', () => {
    const { container } = render(<WeatherIcon code={0} />);
    const img = container.querySelector('img');
    expect(img!.getAttribute('width')).toBe('96');
  });
});

// ---------------------------------------------------------------------------
// Suite: img a11y attributes (rules/coding.md §5.5)
// ---------------------------------------------------------------------------

describe('WeatherIcon — img a11y attributes', () => {
  it('inner img is aria-hidden', () => {
    const { container } = render(<WeatherIcon code={0} />);
    const img = container.querySelector('img');
    expect(img!.getAttribute('aria-hidden')).toBe('true');
  });

  it('inner img has empty alt text (decorative — sr-only span carries the label)', () => {
    const { container } = render(<WeatherIcon code={0} />);
    const img = container.querySelector('img');
    expect(img!.getAttribute('alt')).toBe('');
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
