import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Waves, Wind } from '@phosphor-icons/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Grid } from '@/components/layout/grid';
import { HorizontalScrollNav } from '@/components/ui/horizontal-scroll-nav';
import { AlertsPanel } from './shared/AlertsPanel';
import { TideChart } from './shared/TideChart';
import { MarineStatTile } from '../shared/MarineStatTile';
import { MarineCurrentConditionsCard } from '../shared/MarineCurrentConditionsCard';
import { useMarineDetail, useStation, useTideDetail } from '../../../hooks/useWeatherData';
import { formatValue } from '../../../utils/format';
import { formatTime } from '../../../utils/format-date';
import { cardinalFromDegrees } from '../../../utils/wind';
import type { MarineAlertSummary } from '../../../api/types';
import type { components } from '../../../api/generated-types';

export interface BoatingTabProps { locationId: string; alerts?: MarineAlertSummary[]; }
const BOATING_ALERT_TYPES = new Set(['marineZone', 'coastalFlood']);
type MarineBundle = components['schemas']['MarineBundle'];
type HourlyForecastPoint = components['schemas']['HourlyForecastPoint'];
type OffshoreObservation = components['schemas']['OffshoreMarineObservation'];

function display(value: number | null | undefined, group: Parameters<typeof formatValue>[1], locale: string): string { return value == null ? '—' : formatValue(value, group, locale); }
function compass(value: number | null | undefined, t: (key: string) => string): string { const cardinal = cardinalFromDegrees(value ?? null); return cardinal ? t(`directions.${cardinal}`) : '—'; }
function timeText(value: string | null | undefined, locale: string, stationTz: string): string { return value && !Number.isNaN(new Date(value).getTime()) ? formatTime(new Date(value), locale, stationTz) : '—'; }
function detailId(validTime: string): string { return `boating-period-detail-${encodeURIComponent(validTime)}`; }

function BoatingForecast({ forecast, locationName, locale, stationTz, units }: { forecast: HourlyForecastPoint[]; locationName: string; locale: string; stationTz: string; units: Record<string, string> | undefined }) {
  const { t } = useTranslation('marine'); const { t: tCommon } = useTranslation('common');
  const columns = useMemo(() => forecast.slice(0, 18), [forecast]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const selected = columns.find((period) => period.validTime === selectedTime) ?? null;
  const selectedDetailId = selected ? detailId(selected.validTime) : undefined;
  return <Card footprint="full"><CardHeader><CardTitle as="h3">{t('boating.forecastTitle')}</CardTitle></CardHeader><CardContent className="overflow-visible">
    {columns.length === 0 ? <p className="text-muted-foreground">{t('boating.noForecastData')}</p> : <>
      <HorizontalScrollNav ariaLabel={t('boating.forecastAriaLabel', { location: locationName })}>
        <div data-testid="boating-period-cards" className="flex w-max min-w-full gap-3 pb-2">
          {columns.map((period) => { const selectedPeriod = selected?.validTime === period.validTime; const periodTime = timeText(period.validTime, locale, stationTz); return <Card key={period.validTime} footprint="tile" className={`w-72 shrink-0 ${selectedPeriod ? 'ring-2 ring-primary' : ''}`}>
            <CardHeader><CardTitle as="h4">{periodTime}</CardTitle></CardHeader><CardContent>
            <dl className="mt-3 space-y-3" style={{ fontSize: 'var(--text-label)' }}>
              <div><dt className="text-muted-foreground">{t('boating.conditions')}</dt><dd className="mt-0.5 font-medium">{period.weatherText ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground">{t('airTemp')}</dt><dd className="mt-0.5">{period.outTemp == null ? '—' : t('boating.measurement', { value: display(period.outTemp, 'temperature', locale), unit: units?.temperature ?? '' })}</dd></div>
              <div><dt className="text-muted-foreground">{t('windSpeed')}</dt><dd className="mt-0.5">{period.windSpeed == null ? '—' : t('boating.windMeasurement', { value: display(period.windSpeed, 'wind', locale), unit: units?.windSpeed ?? '', direction: compass(period.windDir, tCommon) })}</dd></div>
              <div><dt className="text-muted-foreground">{t('boating.gust')}</dt><dd className="mt-0.5">{period.windGust == null ? '—' : t('boating.measurement', { value: display(period.windGust, 'wind', locale), unit: units?.windSpeed ?? '' })}</dd></div>
            </dl>
            <section className="mt-4 border-t border-border pt-3" aria-label={t('boating.regionalSource')}>
              <h5 className="font-semibold text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>{t('boating.regionalSource')}</h5>
              <dl className="mt-2 space-y-2" style={{ fontSize: 'var(--text-label)' }}>
                <div><dt className="text-muted-foreground">{t('boating.forecastWind')}</dt><dd>{period.marineAdditions?.wind ?? '—'}</dd></div>
                <div><dt className="text-muted-foreground">{t('boating.forecastSeas')}</dt><dd>{period.marineAdditions?.seas ?? '—'}</dd></div>
                <div><dt className="text-muted-foreground">{t('boating.forecastVisibility')}</dt><dd>{period.marineAdditions?.visibility ?? '—'}</dd></div>
                <div><dt className="text-muted-foreground">{t('boating.forecastWeather')}</dt><dd>{period.marineAdditions?.weather ?? '—'}</dd></div>
              </dl>
            </section>
            <button type="button" onClick={() => setSelectedTime((current) => current === period.validTime ? null : period.validTime)} aria-expanded={selectedPeriod} aria-controls={detailId(period.validTime)} aria-label={t('boating.periodControlAriaLabel', { period: periodTime, conditions: period.weatherText ?? t('boating.unavailable') })} className="mt-4 rounded-md border border-border px-3 py-2 text-left font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1">{t('boating.periodDetailsTitle', { period: periodTime })}</button>
          </CardContent></Card>; })}
        </div>
      </HorizontalScrollNav>
      {selected && <section id={selectedDetailId} aria-live="polite" className="mt-3 border-t border-border pt-3"><h4 className="font-semibold">{t('boating.periodDetailsTitle', { period: timeText(selected.validTime, locale, stationTz) })}</h4><dl className="mt-2 grid gap-3 sm:grid-cols-3"><MarineStatTile label={t('boating.conditions')} value={selected.weatherText ?? '—'} /><MarineStatTile label={t('boating.forecastWind')} value={selected.marineAdditions?.wind ?? '—'} /><MarineStatTile label={t('boating.forecastSeas')} value={selected.marineAdditions?.seas ?? '—'} /><MarineStatTile label={t('boating.forecastVisibility')} value={selected.marineAdditions?.visibility ?? '—'} /></dl>{selected.marineAdditions?.weather && <div className="mt-3"><h5 className="font-medium">{t('boating.forecastWeather')}</h5><p className="mt-1 text-muted-foreground">{selected.marineAdditions.weather}</p></div>}</section>}
    </>}
  </CardContent></Card>;
}

function OffshoreObservations({ context, locale, stationTz, units }: { context: MarineBundle['offshoreObservations']; locale: string; stationTz: string; units: Record<string, string> | undefined }) {
  const { t } = useTranslation('marine');
  const stateMessage = !context ? t('boating.offshoreSelectionState.no_buoy_selected') : t(`boating.offshoreSelectionState.${context.selectionState}`);
  return <Card footprint="wide"><CardHeader><CardTitle as="h3">{t('boating.offshoreTitle')}</CardTitle></CardHeader><CardContent className="gap-4"><p className="text-muted-foreground">{t('boating.offshoreContextWarning')}</p><p className="text-muted-foreground">{stateMessage}</p>{context?.observations.map((observation: OffshoreObservation) => <div key={observation.stationId} className="border-t border-border pt-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-semibold">{observation.stationId}</p><p className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>{t(`boating.offshoreDataState.${observation.dataState}`)}</p></div><p className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>{observation.distanceKm == null ? t('boating.distanceUnavailable') : t('boating.distanceKm', { distance: display(observation.distanceKm, 'default', locale) })} · {timeText(observation.validTime, locale, stationTz)}</p><dl className="mt-2 grid grid-cols-2 gap-3"><MarineStatTile icon={<Waves />} label={t('waveHeight')} value={display(observation.waveHeight, 'default', locale)} unit={observation.waveHeight == null ? undefined : units?.waveHeight} /><MarineStatTile label={t('boating.wavePeriod')} value={display(observation.wavePeriod, 'default', locale)} unit={observation.wavePeriod == null ? undefined : units?.wavePeriod} /><MarineStatTile icon={<Wind />} label={t('windSpeed')} value={display(observation.windSpeed, 'wind', locale)} unit={observation.windSpeed == null ? undefined : units?.windSpeed} /></dl></div>)}</CardContent></Card>;
}

export function BoatingTab({ locationId, alerts = [] }: BoatingTabProps) {
  const { t, i18n } = useTranslation('marine'); const { t: tCommon } = useTranslation('common'); const { data: rawMarine, units, loading, error, refetch } = useMarineDetail(locationId); const { data: tideData } = useTideDetail(locationId); const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC'; const marine = rawMarine as unknown as MarineBundle | null; const unitMap = units as Record<string, string> | undefined;
  if (loading) return <span role="status" className="sr-only">{t('boating.loading')}</span>;
  if (error) return <div role="alert"><p className="text-destructive">{t('boating.unableToLoad')}</p><button type="button" onClick={refetch} className="focus-visible:ring-2 focus-visible:ring-ring">{tCommon('retry')}</button></div>;
  if (!marine) return <p className="text-muted-foreground">{t('boating.noData')}</p>;
  return <div className="flex flex-col gap-[var(--gap-grid)]"><AlertsPanel alerts={alerts} filterTypes={BOATING_ALERT_TYPES} /><Grid className="md:!auto-rows-[auto]"><MarineCurrentConditionsCard observation={marine.observation} locale={i18n.language} stationTz={stationTz} units={unitMap} title={t('boating.currentConditions')} /><BoatingForecast forecast={marine.regularForecast ?? []} locationName={marine.locationName} locale={i18n.language} stationTz={stationTz} units={unitMap} /><OffshoreObservations context={marine.offshoreObservations} locale={i18n.language} stationTz={stationTz} units={unitMap} /><Card footprint="full"><CardHeader><CardTitle as="h3">{t('boating.tideForecastTitle')}</CardTitle></CardHeader><CardContent><TideChart predictions={tideData?.predictions ?? []} locale={i18n.language} stationTz={stationTz} heightUnit={unitMap?.height ?? 'ft'} ariaLabel={t('boating.tideForecastAriaLabel', { location: marine.locationName })} /></CardContent></Card></Grid></div>;
}
export default BoatingTab;
