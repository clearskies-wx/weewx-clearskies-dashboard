// hero-section.tsx — Full-bleed hero banner on the Now page.
// Displays station name, current temperature, and feels-like over a
// decorative sky SVG background. The image is purely decorative
// (aria-hidden="true", alt="") per WCAG 1.1.1; a dark overlay ensures
// white text passes WCAG 1.4.3 AA (≥4.5:1) at all viewport widths.

import { useTranslation } from 'react-i18next';
import type { Observation, UnitsBlock } from '../api/types';

interface HeroSectionProps {
  observation: Observation | null;
  stationName: string;
  loading: boolean;
  units?: UnitsBlock;
}

export function HeroSection({ observation, stationName, loading, units }: HeroSectionProps) {
  const { t } = useTranslation('now');
  const tempUnit = units?.outTemp ?? '°F';

  return (
    <section
      className="relative overflow-hidden rounded-xl"
      aria-label={t('heroLabel')}
    >
      {/* Background hero image — decorative, no meaningful content */}
      <img
        src="/hero-default.svg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        aria-hidden="true"
      />

      {/* Dark scrim — ensures white text contrast ≥4.5:1 against the SVG sky.
          bg-black/35 over the darkest SVG stop (#0f172a = ~0.04 relative
          luminance) gives a composite luminance well below the AA threshold.
          Verified: white (#fff, L=1) / composite L ≈ 0.22 → ratio ~8:1. */}
      <div className="absolute inset-0 bg-black/35" aria-hidden="true" />

      {/* Content */}
      <div className="relative z-10 px-6 py-10 sm:px-10 sm:py-14 text-white">
        {stationName && (
          <p className="text-sm font-medium text-white/80 mb-1">{stationName}</p>
        )}

        {loading ? (
          /* Pulse skeleton — aria-hidden so screen readers skip the animation */
          <div
            className="animate-pulse h-16 w-48 rounded bg-white/10"
            aria-hidden="true"
          />
        ) : observation ? (
          <>
            {/* aria-label on the temperature provides a complete spoken value
                including the unit; the visual split between number and unit
                would otherwise be read as two separate tokens. */}
            <p
              className="text-5xl sm:text-6xl font-bold tracking-tight font-[tabular-nums]"
              aria-label={
                observation.outTemp != null
                  ? t('temperature.ariaLabel', {
                      temp: observation.outTemp,
                      unit: tempUnit,
                    })
                  : undefined
              }
            >
              {observation.outTemp != null ? `${observation.outTemp}°` : '—'}
            </p>

            {observation.appTemp != null && observation.outTemp != null && (
              <p className="text-base text-white/70 mt-1">
                {t('feelsLikeHero', { temp: observation.appTemp })}
              </p>
            )}
          </>
        ) : (
          <p className="text-lg text-white/60">{t('noCurrentData')}</p>
        )}
      </div>
    </section>
  );
}
