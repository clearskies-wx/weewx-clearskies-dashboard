/**
 * WeatherIcon — maps WMO weather interpretation codes to Erik Flowers'
 * Weather Icons CSS classes (ADR-002, ADR-009 gap #20).
 *
 * Accessibility: the visible <i> element is aria-hidden; a sibling
 * <span class="sr-only"> carries the translated description for screen readers.
 *
 * Day/night: pass isNight=true to use wi-night-* variants where the icon
 * set provides them. Falls back to the day variant when no night equivalent
 * exists in the mapping.
 */
import { useTranslation } from 'react-i18next';

/** WMO code → { day: wi-class, night?: wi-class, descriptionKey: i18n key } */
interface IconEntry {
  day: string;
  night?: string;
  descriptionKey: string;
}

/**
 * Mapping from WMO weather interpretation code to Weather Icons class names.
 * Source: https://open-meteo.com/en/docs (WMO code table)
 * Icon set: https://erikflowers.github.io/weather-icons/
 */
const WMO_MAP: Record<number, IconEntry> = {
  // Clear
  0:  { day: 'wi-day-sunny',           night: 'wi-night-clear',          descriptionKey: 'wmo.0'  },
  // Mainly clear
  1:  { day: 'wi-day-sunny-overcast',  night: 'wi-night-partly-cloudy',  descriptionKey: 'wmo.1'  },
  // Partly cloudy
  2:  { day: 'wi-day-cloudy',          night: 'wi-night-alt-cloudy',     descriptionKey: 'wmo.2'  },
  // Overcast
  3:  { day: 'wi-cloudy',                                                 descriptionKey: 'wmo.3'  },
  // Fog
  45: { day: 'wi-fog',                                                    descriptionKey: 'wmo.45' },
  48: { day: 'wi-fog',                                                    descriptionKey: 'wmo.48' },
  // Drizzle — light, moderate, dense
  51: { day: 'wi-sprinkle',                                               descriptionKey: 'wmo.51' },
  53: { day: 'wi-sprinkle',                                               descriptionKey: 'wmo.53' },
  55: { day: 'wi-sprinkle',                                               descriptionKey: 'wmo.55' },
  // Freezing drizzle — light, dense
  56: { day: 'wi-rain-mix',                                               descriptionKey: 'wmo.56' },
  57: { day: 'wi-rain-mix',                                               descriptionKey: 'wmo.57' },
  // Rain — slight, moderate, heavy
  61: { day: 'wi-rain',                                                   descriptionKey: 'wmo.61' },
  63: { day: 'wi-rain',                                                   descriptionKey: 'wmo.63' },
  65: { day: 'wi-rain',                                                   descriptionKey: 'wmo.65' },
  // Freezing rain — light, heavy
  66: { day: 'wi-rain-mix',                                               descriptionKey: 'wmo.66' },
  67: { day: 'wi-rain-mix',                                               descriptionKey: 'wmo.67' },
  // Snow — slight, moderate, heavy
  71: { day: 'wi-snow',                                                   descriptionKey: 'wmo.71' },
  73: { day: 'wi-snow',                                                   descriptionKey: 'wmo.73' },
  75: { day: 'wi-snow',                                                   descriptionKey: 'wmo.75' },
  // Snow grains
  77: { day: 'wi-snowflake-cold',                                         descriptionKey: 'wmo.77' },
  // Rain showers — slight, moderate, violent
  80: { day: 'wi-showers',            night: 'wi-night-showers',         descriptionKey: 'wmo.80' },
  81: { day: 'wi-showers',            night: 'wi-night-showers',         descriptionKey: 'wmo.81' },
  82: { day: 'wi-showers',            night: 'wi-night-showers',         descriptionKey: 'wmo.82' },
  // Snow showers — slight, heavy
  85: { day: 'wi-snow',                                                   descriptionKey: 'wmo.85' },
  86: { day: 'wi-snow',                                                   descriptionKey: 'wmo.86' },
  // Thunderstorm — slight/moderate
  95: { day: 'wi-thunderstorm',                                           descriptionKey: 'wmo.95' },
  // Thunderstorm with hail — slight, heavy
  96: { day: 'wi-storm-showers',                                          descriptionKey: 'wmo.96' },
  99: { day: 'wi-storm-showers',                                          descriptionKey: 'wmo.99' },
};

/** Fallback for unknown / null codes */
const FALLBACK: IconEntry = { day: 'wi-na', descriptionKey: 'wmo.unknown' };

export interface WeatherIconProps {
  /** WMO weather interpretation code (0–99). Pass null when no data. */
  code: number | string | null;
  /** When true, prefer wi-night-* variants where available. */
  isNight?: boolean;
  /** Additional CSS class names applied to the <i> element. */
  className?: string;
  /**
   * Icon size. Maps to font-size via inline style.
   * Accepts 16 | 20 | 24 (px) per ADR-009, or any CSS length string.
   */
  size?: 16 | 20 | 24 | string;
}

/**
 * Render a Weather Icons glyph for the given WMO code.
 *
 * The visible <i> is aria-hidden; the screen-reader description comes from
 * a sr-only <span> so assistive technology gets the translated text without
 * reading raw CSS class names.
 */
export function WeatherIcon({ code, isNight = false, className = '', size }: WeatherIconProps) {
  const { t } = useTranslation('weather');

  const numCode = code === null ? null : typeof code === 'string' ? parseInt(code, 10) : code;
  const entry = (numCode !== null && !isNaN(numCode) && numCode in WMO_MAP)
    ? WMO_MAP[numCode]
    : FALLBACK;

  const iconClass = (isNight && entry.night) ? entry.night : entry.day;
  const description = t(entry.descriptionKey, { defaultValue: entry.descriptionKey });

  const sizeStyle = size !== undefined
    ? { fontSize: typeof size === 'number' ? `${size}px` : size }
    : undefined;

  return (
    <>
      <i
        className={`wi ${iconClass}${className ? ` ${className}` : ''}`}
        aria-hidden="true"
        style={sizeStyle}
      />
      <span className="sr-only">{description}</span>
    </>
  );
}

export default WeatherIcon;
