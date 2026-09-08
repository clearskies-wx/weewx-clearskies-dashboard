import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Waves, Wind } from '@phosphor-icons/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

function display(value: number | null | undefined, group: Parameters<typeof formatValue>[1], locale: string): string {
  return value == null ? '—' : formatValue(value, group, locale);
}
function compass(value: number | null | undefined, t: (key: string) => string): string {
  const cardinal = cardinalFromDegrees(value ?? null);
  return cardinal ? t(`directions.${cardinal}`) : '—';
}
function timeText(value: string | null | undefined, locale: string, stationTz: string): string {
  return value && !Number.isNaN(new Date(value).getTime()) ? formatTime(new Date(value), locale, stationTz) : '—';
}

function ForecastRow({ label, columns, render }: { label: string; columns: HourlyForecastPoint[]; render: (period: HourlyForecastPoint) => string }) {
  return <tr className="border-t border-border"><th scope="row" className="sticky left-0 z-10 bg-card px-2 py-2 font-medium text-muted-foreground">{label}</th>{columns.map((period) => <td key={period.validTime} className="max-w-52 border-l border-border px-3 py-2 align-top">{render(period)}</td>)}</tr>;
}
function RegionalForecastRow({ label, columns, render, sourceLabel }: { label: string; columns: HourlyForecastPoint[]; render: (period: HourlyForecastPoint) => string; sourceLabel: string }) {
  return <tr className="border-t border-border"><th scope="row" className="sticky left-0 z-10 bg-card px-2 py-2 font-medium text-muted-foreground">{label}<span className="mt-1 block" style={{ fontSize: 'var(--text-micro)' }}>{sourceLabel}</span></th>{columns.map((period) => <td key={period.validTime} className="max-w-52 border-l border-border px-3 py-2 align-top">{render(period)}</td>)}</tr>;
}
function BoatingForecast({ forecast, locale, stationTz, units }: { forecast: HourlyForecastPoint[]; locale: string; stationTz: string; units: Record<string, string> | undefined }) {
  const { t } = useTranslation('marine'); const { t: tCommon } = useTranslation('common');
  const columns = useMemo(() => forecast.slice(0, 18), [forecast]);
  const regionalNws = t('boating.regionalNws', { defaultValue: 'Regional NWS' });
  return <Card footprint="full"><CardHeader><CardTitle as="h3">{t('boating.waveForecastTitle')}</CardTitle></CardHeader><CardContent>
    {columns.length === 0 ? <p className="text-muted-foreground">{t('boating.noForecastData')}</p> : <HorizontalScrollNav ariaLabel={t('boating.waveForecastAriaLabel', { location: '' })}><table className="min-w-max w-full border-collapse text-left" style={{ fontSize: 'var(--text-label)' }}><thead><tr><th scope="col" className="sticky left-0 z-10 bg-card px-2 py-2">{t('boating.srTimeColumn')}</th>{columns.map((period) => <th key={period.validTime} scope="col" className="min-w-40 border-l border-border px-3 py-2 align-top font-semibold">{timeText(period.validTime, locale, stationTz)}</th>)}</tr></thead><tbody>
      <ForecastRow label={t('airTemp')} columns={columns} render={(p) => `${display(p.outTemp, 'temperature', locale)}${p.outTemp == null ? '' : ` ${units?.temperature ?? ''}`}`} />
      <ForecastRow label={t('windSpeed')} columns={columns} render={(p) => `${display(p.windSpeed, 'wind', locale)}${p.windSpeed == null ? '' : ` ${units?.windSpeed ?? ''}`} ${compass(p.windDir, tCommon)}`} />
      <ForecastRow label={t('boating.gust')} columns={columns} render={(p) => `${display(p.windGust, 'wind', locale)}${p.windGust == null ? '' : ` ${units?.windSpeed ?? ''}`}`} />
      <ForecastRow label={t('boating.conditions')} columns={columns} render={(p) => p.weatherText ?? '—'} />
      <RegionalForecastRow label={t('boating.forecastWind')} columns={columns} render={(p) => p.marineAdditions?.wind ?? '—'} sourceLabel={regionalNws} />
      <RegionalForecastRow label={t('boating.forecastSeas')} columns={columns} render={(p) => p.marineAdditions?.seas ?? '—'} sourceLabel={regionalNws} />
      <RegionalForecastRow label={t('boating.forecastVisibility')} columns={columns} render={(p) => p.marineAdditions?.visibility ?? '—'} sourceLabel={regionalNws} />
      <RegionalForecastRow label={t('boating.forecastWeather')} columns={columns} render={(p) => p.marineAdditions?.weather ?? '—'} sourceLabel={regionalNws} />
    </tbody></table></HorizontalScrollNav>}
  </CardContent></Card>;
}

function OffshoreObservations({ context, locale, stationTz, units }: { context: MarineBundle['offshoreObservations']; locale: string; stationTz: string; units: Record<string, string> | undefined }) {
  const { t } = useTranslation('marine');
  const stateMessage = !context || context.selectionState === 'no_buoy_selected'
    ? t('boating.noBuoySelected', { defaultValue: 'No offshore buoy is configured for this location.' })
    : context.selectionState === 'selected_buoy_no_observation'
      ? t('boating.selectedBuoyNoObservation', { defaultValue: 'The configured offshore buoy has no current observation.' })
      : context.selectionState === 'provider_failure'
        ? t('boating.offshoreProviderFailure', { defaultValue: 'Offshore observations are currently unavailable from their provider.' })
        : null;
  return <Card footprint="wide"><CardHeader><CardTitle as="h3">{t('surfing.offshore')}</CardTitle></CardHeader><CardContent className="gap-4"><p className="text-muted-foreground">{t('boating.offshoreContextWarning', { defaultValue: 'Offshore observations are route and exit context only; they are not conditions at this selected location.' })}</p>{stateMessage && <p className="text-muted-foreground">{stateMessage}</p>}{context?.observations.map((observation: OffshoreObservation) => <div key={observation.stationId} className="border-t border-border pt-3"><p className="font-semibold">{observation.stationId}</p><p className="text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>{observation.distanceKm == null ? '—' : t('boating.distanceKm', { defaultValue: '{{distance}} km', distance: display(observation.distanceKm, 'default', locale) })} · {timeText(observation.validTime, locale, stationTz)}</p><dl className="mt-2 grid grid-cols-2 gap-3"><MarineStatTile icon={<Waves />} label={t('waveHeight')} value={display(observation.waveHeight, 'default', locale)} unit={observation.waveHeight == null ? undefined : units?.waveHeight} /><MarineStatTile label={t('boating.wavePeriod')} value={display(observation.wavePeriod, 'default', locale)} unit={observation.wavePeriod == null ? undefined : units?.wavePeriod} /><MarineStatTile icon={<Wind />} label={t('windSpeed')} value={display(observation.windSpeed, 'wind', locale)} unit={observation.windSpeed == null ? undefined : units?.windSpeed} /></dl></div>)}</CardContent></Card>;
}

export function BoatingTab({ locationId, alerts = [] }: BoatingTabProps) {
  const { t, i18n } = useTranslation('marine'); const { data: rawMarine, units, loading, error, refetch } = useMarineDetail(locationId); const { data: tideData } = useTideDetail(locationId); const { data: station } = useStation();
  const stationTz = station?.timezone ?? 'UTC'; const marine = rawMarine as unknown as MarineBundle | null; const unitMap = units as Record<string, string> | undefined;
  if (loading) return <span role="status" className="sr-only">{t('boating.loading')}</span>;
  if (error) return <div role="alert"><p className="text-destructive">{t('boating.unableToLoad')}</p><button type="button" onClick={refetch} className="focus-visible:ring-2 focus-visible:ring-ring">{t('lastUpdated', { time: '' })}</button></div>;
  if (!marine) return <p className="text-muted-foreground">{t('boating.noData')}</p>;
  return <div className="flex flex-col gap-[var(--gap-grid)]"><AlertsPanel alerts={alerts} filterTypes={BOATING_ALERT_TYPES} /><MarineCurrentConditionsCard observation={marine.observation} locale={i18n.language} stationTz={stationTz} units={unitMap} title={t('boating.currentConditions')} /><BoatingForecast forecast={marine.regularForecast ?? []} locale={i18n.language} stationTz={stationTz} units={unitMap} /><OffshoreObservations context={marine.offshoreObservations} locale={i18n.language} stationTz={stationTz} units={unitMap} /><Card footprint="full"><CardHeader><CardTitle as="h3">{t('boating.tideForecastTitle')}</CardTitle></CardHeader><CardContent><TideChart predictions={tideData?.predictions ?? []} locale={i18n.language} stationTz={stationTz} heightUnit={unitMap?.height ?? 'ft'} ariaLabel={t('boating.tideForecastAriaLabel', { location: marine.locationName })} /></CardContent></Card></div>;
}
export default BoatingTab;
