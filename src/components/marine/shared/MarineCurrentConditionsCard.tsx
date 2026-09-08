import { ArrowDown, ArrowRight, ArrowUp, Drop, Gauge, Thermometer, Waves, Wind } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WeatherIcon } from '@/components/weather-icon';
import { formatValue } from '../../../utils/format';
import { formatTime } from '../../../utils/format-date';
import { cardinalFromDegrees } from '../../../utils/wind';
import type { components } from '../../../api/generated-types';
import { MarineStatTile } from './MarineStatTile';

type MarineObservation = components['schemas']['MarineObservation'];

export interface MarineCurrentConditionsCardProps {
  observation: MarineObservation | null | undefined;
  locale: string;
  stationTz: string;
  units: Record<string, string> | undefined;
  title: string;
}

function display(value: number | null | undefined, group: string, locale: string): string {
  return value == null ? '—' : formatValue(value, group, locale);
}

function timestamp(value: string | null | undefined, locale: string, stationTz: string): string {
  return value && !Number.isNaN(new Date(value).getTime()) ? formatTime(new Date(value), locale, stationTz) : '—';
}

export function MarineCurrentConditionsCard({ observation, locale, stationTz, units, title }: MarineCurrentConditionsCardProps) {
  const { t } = useTranslation('marine');
  const { t: tCommon } = useTranslation('common');
  const { t: tNow } = useTranslation('now');
  const parsedWeatherCode = typeof observation?.weatherCode === 'number' ? observation.weatherCode : Number(observation?.weatherCode);
  const weatherCode = Number.isFinite(parsedWeatherCode) ? parsedWeatherCode : null;
  const tendency = observation?.pressureTendency ?? null;
  const trendIcon = tendency == null ? undefined : tendency > 0 ? <ArrowUp aria-hidden="true" /> : tendency < 0 ? <ArrowDown aria-hidden="true" /> : <ArrowRight aria-hidden="true" />;
  const trend = tendency == null ? '—' : tendency > 0 ? t('boating.pressureRising') : tendency < 0 ? t('boating.pressureFalling') : t('boating.pressureSteady');
  const windCardinal = cardinalFromDegrees(observation?.windDirection ?? null);

  return <Card footprint="full"><CardHeader><CardTitle as="h3">{title}</CardTitle></CardHeader><CardContent className="gap-4">
    <div className="flex items-center gap-3">{weatherCode != null && <WeatherIcon code={weatherCode} isNight={observation?.isDay === false} size={40} />}<div><p className="font-semibold">{observation?.weatherText ?? '—'}</p><p className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>{timestamp(observation?.time, locale, stationTz)}</p></div></div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
      <MarineStatTile icon={<Thermometer />} label={t('airTemp')} value={display(observation?.airTemp, 'temperature', locale)} unit={observation?.airTemp == null ? undefined : units?.temperature} />
      <MarineStatTile icon={<Thermometer />} label={tNow('feelsLike')} value={display(observation?.feelsLike, 'temperature', locale)} unit={observation?.feelsLike == null ? undefined : units?.temperature} />
      <MarineStatTile icon={<Drop />} label={tNow('observations.humidity')} value={display(observation?.humidity, 'humidity', locale)} unit={observation?.humidity == null ? undefined : '%'} />
      <MarineStatTile icon={<Drop />} label={t('boating.dewpoint')} value={display(observation?.dewpoint, 'temperature', locale)} unit={observation?.dewpoint == null ? undefined : units?.temperature} />
      <MarineStatTile label={t('boating.visibility')} value={display(observation?.visibility, 'visibility', locale)} unit={observation?.visibility == null ? undefined : units?.visibility} />
      <MarineStatTile icon={<Wind />} label={t('windSpeed')} value={display(observation?.windSpeed, 'wind', locale)} unit={observation?.windSpeed == null ? undefined : units?.windSpeed} />
      <MarineStatTile icon={<Wind />} label={t('boating.gust')} value={display(observation?.windGust, 'wind', locale)} unit={observation?.windGust == null ? undefined : units?.windSpeed} />
      <MarineStatTile label={t('boating.direction')} value={windCardinal ? tCommon(`directions.${windCardinal}`) : '—'} />
      <MarineStatTile icon={<Gauge />} label={t('boating.pressure')} value={display(observation?.pressure, 'barometer', locale)} unit={observation?.pressure == null ? undefined : units?.pressure} />
      <MarineStatTile icon={trendIcon} label={t('fishing.pressureTrend')} value={trend} />
      <MarineStatTile icon={<Thermometer />} label={t('waterTemp')} value={display(observation?.waterTemp, 'temperature', locale)} unit={observation?.waterTemp == null ? undefined : units?.temperature} />
      <MarineStatTile icon={<Waves />} label={t('tide.predictedTide')} value={display(observation?.tideLevel, 'waterLevel', locale)} unit={observation?.tideLevel == null ? undefined : units?.height} />
    </dl>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3 sm:grid-cols-4">
      <MarineStatTile label={t('boating.conditions')} value={observation?.provenance?.conditions?.source ?? observation?.source ?? '—'} unit={timestamp(observation?.provenance?.conditions?.validTime, locale, stationTz)} />
      <MarineStatTile label={t('boating.pressure')} value={observation?.provenance?.pressure?.source ?? '—'} unit={timestamp(observation?.provenance?.pressure?.validTime, locale, stationTz)} />
      <MarineStatTile label={t('waterTemp')} value={observation?.provenance?.waterTemperature?.source ?? '—'} unit={timestamp(observation?.provenance?.waterTemperature?.validTime, locale, stationTz)} />
      <MarineStatTile label={t('tide.predictedTide')} value={observation?.provenance?.tideCurrent?.source ?? '—'} unit={timestamp(observation?.provenance?.tideCurrent?.validTime, locale, stationTz)} />
    </dl>
  </CardContent></Card>;
}
