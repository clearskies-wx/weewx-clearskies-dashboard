import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MoonStars } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HorizontalScrollNav } from '@/components/ui/horizontal-scroll-nav';
import { SunMoonDetailCard } from '../../almanac/SunMoonDetailCard';
import { AlertsPanel } from './shared/AlertsPanel';
import { TideChart } from './shared/TideChart';
import { MarineStatTile } from '../shared/MarineStatTile';
import { MarineCurrentConditionsCard } from '../shared/MarineCurrentConditionsCard';
import { useAlmanac, useAlmanacMoonNames, useAlmanacPositions, useFishingDetail, useMarineDetail, useStation } from '../../../hooks/useWeatherData';
import { useSmartAlmanac } from '../../../hooks/useSmartAlmanac';
import { formatValue } from '../../../utils/format';
import { formatTime } from '../../../utils/format-date';
import { cardinalFromDegrees } from '../../../utils/wind';
import { addDays } from '../../../utils/station-clock';
import type { AlmanacSnapshot, MarineAlertSummary, MoonNameData, PositionsSnapshot } from '../../../api/types';
import type { components } from '../../../api/generated-types';

export interface FishingTabProps { locationId: string; alerts?: MarineAlertSummary[]; selectedSpecies?: string; onSelectedSpeciesChange?: (species: string) => void; }

const FISHING_ALERT_TYPES = new Set(['marineZone']);
type FishingData = components['schemas']['FishingData'];
type FishingPeriod = components['schemas']['FishingForecast'];
type FishingDay = components['schemas']['FishingDayEntry'];
type FactorName = 'temperature' | 'tideCurrent' | 'pressure';
type FactorRecord = { available?: boolean; source?: string; sourceType?: string; validTime?: string | null; };
type TranslateFn = ReturnType<typeof useTranslation>['t'];

function display(value: number | null | undefined, group: Parameters<typeof formatValue>[1], locale: string): string { return value == null ? '—' : formatValue(value, group, locale); }
function timeText(value: string | null | undefined, locale: string, tz: string): string { return value && !Number.isNaN(new Date(value).getTime()) ? formatTime(new Date(value), locale, tz) : '—'; }
function cardinal(value: number | null | undefined, t: (key: string) => string): string { const name = cardinalFromDegrees(value ?? null); return name ? t(`directions.${name}`) : '—'; }
function humanize(value: string): string { return value.replaceAll('_', ' '); }
function statusClass(status: FishingPeriod['status']): string { return status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : status === 'less_active' || status === 'low_activity' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : status === 'inactive' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200' : 'bg-muted text-muted-foreground'; }
function localizeWithFallback(t: TranslateFn, key: string, fallback: string): string { return t(key, { defaultValue: fallback }); }
function localizedStatus(t: TranslateFn, status: FishingPeriod['status']): string { return status ? localizeWithFallback(t, `fishing.status.${status}`, humanize(status)) : localizeWithFallback(t, 'fishing.status.unavailable', 'Unavailable'); }
function localizedTideState(t: TranslateFn, state: string | null | undefined): string { return state ? localizeWithFallback(t, `fishing.tideState.${state}`, humanize(state)) : localizeWithFallback(t, 'fishing.tideState.unavailable', 'Unavailable'); }
function localizedSolunarState(t: TranslateFn, state: string | null | undefined): string { return state ? localizeWithFallback(t, `fishing.solunarState.${state}`, humanize(state)) : localizeWithFallback(t, 'fishing.solunarState.unavailable', 'Unavailable'); }
function localizeAdjustmentValue(t: TranslateFn, prefix: 'adjustmentFactor' | 'adjustmentState', value: string | null | undefined): string { return value ? localizeWithFallback(t, `fishing.${prefix}.${value}`, humanize(value)) : localizeWithFallback(t, 'fishing.adjustmentUnknown', 'Unknown'); }

function ForecastRow({ label, periods, render }: { label: string; periods: FishingPeriod[]; render: (period: FishingPeriod) => ReactNode; }) {
  return <tr className="border-t border-border"><th scope="row" className="sticky left-0 z-10 bg-card px-2 py-2 font-medium text-muted-foreground">{label}</th>{periods.map((period) => <td key={period.periodStart} className="max-w-52 border-l border-border px-3 py-2 align-top">{render(period)}</td>)}</tr>;
}

function factorLabel(name: FactorName, t: (key: string) => string): string { return name === 'temperature' ? t('waterTemp') : name === 'tideCurrent' ? t('fishing.hero.tideState') : t('fishing.pressure'); }
function factorSuitability(period: FishingPeriod, name: FactorName): number | null { return name === 'temperature' ? period.temperatureSuitability : name === 'tideCurrent' ? period.tideCurrentSuitability : period.pressureSuitability; }

function FactorExplanation({ period, locale, stationTz }: { period: FishingPeriod; locale: string; stationTz: string; }) {
  const { t } = useTranslation('marine');
  const provenance = period.factorProvenance as Record<string, FactorRecord> | undefined;
  const factors: FactorName[] = ['temperature', 'tideCurrent', 'pressure'];
  return <section className="mt-4 border-t border-border pt-4" aria-labelledby={`fishing-factors-${period.periodStart}`}>
    <h4 id={`fishing-factors-${period.periodStart}`} className="font-semibold">{t('fishing.conditions')}</h4>
    <dl className="mt-2 grid gap-3 sm:grid-cols-3" style={{ fontSize: 'var(--text-label)' }}>{factors.map((name) => {
      const record = provenance?.[name]; const suitability = factorSuitability(period, name);
      const source = record?.available && record.source ? record.source : t('fishing.factorUnavailable');
      const sourceType = record?.available && record.sourceType ? t(`fishing.provenanceType.${record.sourceType}`, humanize(record.sourceType)) : null;
      const validTime = record?.available ? timeText(record.validTime, locale, stationTz) : null;
      return <div key={name} className="rounded-md bg-muted/50 p-3"><dt className="font-medium">{factorLabel(name, t)}</dt><dd className="mt-1 font-semibold">{suitability == null ? '—' : `${Math.round(suitability * 100)}%`}</dd><dd className="mt-1 text-muted-foreground">{sourceType ? `${sourceType} · ${source}` : source}</dd>{validTime && <dd className="text-muted-foreground">{validTime}</dd>}</div>;
    })}</dl>
  </section>;
}

function formatAdjustment(t: TFunction, adjustment: unknown): string {
  if (!adjustment || typeof adjustment !== 'object') return '—';
  const item = adjustment as Record<string, unknown>; const factor = typeof item.factor === 'string' ? item.factor : null; const state = typeof item.state === 'string' ? item.state : null; const multiplier = typeof item.multiplier === 'number' && Number.isFinite(item.multiplier) ? item.multiplier : null;
  const factorText = factor ? localizeAdjustmentValue(t, 'adjustmentFactor', factor) : null; const stateText = state ? localizeAdjustmentValue(t, 'adjustmentState', state) : null;
  return [factorText, stateText, multiplier == null ? null : `× ${multiplier}`].filter((part): part is string => part !== null).join(' · ') || '—';
}

function PeriodDetail({ period, locale, stationTz, units }: { period: FishingPeriod; locale: string; stationTz: string; units: Record<string, string> | undefined; }) {
  const { t } = useTranslation('marine'); const { t: tCommon } = useTranslation('common');
  return <div className="border-t border-border pt-4" aria-live="polite"><p className="font-semibold">{period.conditionsText}</p><dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3"><MarineStatTile label={t('fishing.score')} value={period.score == null ? '—' : `${period.score}/100`} /><MarineStatTile label={t('fishing.scoring.title')} value={period.coreScore == null ? '—' : `${period.coreScore}/100`} /><MarineStatTile label={t('fishing.hero.tideState')} value={localizedTideState(t, period.tideState)} /><MarineStatTile label={t('fishing.pressure')} value={display(period.pressureTrend, 'barometer', locale)} unit={period.pressureTrend == null ? undefined : units?.pressure} /><MarineStatTile label={t('fishing.direction')} value={cardinal(period.windDirection, tCommon)} /><MarineStatTile label={t('waterTemp')} value={display(period.waterTemperature, 'temperature', locale)} unit={period.waterTemperature == null ? undefined : units?.temperature} /></dl>{period.hardStopReason && <p className="mt-3 text-destructive">{localizeWithFallback(t, `fishing.hardStop.${period.hardStopReason}`, humanize(period.hardStopReason))}</p>}<FactorExplanation period={period} locale={locale} stationTz={stationTz} /><ul className="mt-3 list-disc pl-5 text-muted-foreground" style={{ fontSize: 'var(--text-label)' }}>{period.appliedAdjustments.map((adjustment, index) => <li key={index}>{formatAdjustment(t, adjustment)}</li>)}</ul></div>;
}

function FishingForecastCard({ data, selectedSpecies, onSelectedSpeciesChange, locale, stationTz, units }: { data: FishingData; selectedSpecies: string; onSelectedSpeciesChange: (species: string) => void; locale: string; stationTz: string; units: Record<string, string> | undefined; }) {
  const { t } = useTranslation('marine'); const { t: tCommon } = useTranslation('common'); const [detailStart, setDetailStart] = useState<string | null>(null);
  const periods = useMemo(() => data.days.flatMap((day) => day.periods.map((period) => ({ day, period }))), [data.days]); const selectedPeriods = periods.filter(({ period }) => period.selectedSpecies === selectedSpecies); const detail = selectedPeriods.find(({ period }) => period.periodStart === detailStart) ?? selectedPeriods[0] ?? null;
  return <Card footprint="full"><CardHeader><CardTitle as="h3">{t('fishing.periodGrid')}</CardTitle></CardHeader><CardContent className="gap-4"><div role="group" aria-label={t('fishing.species')} className="flex flex-wrap gap-2">{data.species.map((species) => <button key={species} type="button" aria-pressed={species === selectedSpecies} onClick={() => onSelectedSpeciesChange(species)} className={`min-h-11 rounded-full px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring ${species === selectedSpecies ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/70'}`}>{humanize(species)}</button>)}</div>{selectedPeriods.length === 0 ? <p className="text-muted-foreground">{t('fishing.noData')}</p> : <><HorizontalScrollNav ariaLabel={t('fishing.periodGridScrollAriaLabel')}><table className="min-w-max w-full border-collapse text-left" style={{ fontSize: 'var(--text-label)' }}><thead><tr><th scope="col" className="sticky left-0 z-10 bg-card px-2 py-2">{t('fishing.day')}</th>{selectedPeriods.map(({ period }) => <th key={period.periodStart} scope="col" className="min-w-48 border-l border-border px-3 py-2"><button type="button" aria-expanded={detail?.period.periodStart === period.periodStart} onClick={() => setDetailStart(period.periodStart)} className="w-full text-left focus-visible:ring-2 focus-visible:ring-ring">{period.periodLabel}<span className="mt-1 block text-muted-foreground">{timeText(period.periodStart, locale, stationTz)} – {timeText(period.periodEnd, locale, stationTz)}</span></button></th>)}</tr></thead><tbody><ForecastRow label={t('fishing.score')} periods={selectedPeriods.map(({ period }) => period)} render={(period) => period.score == null ? '—' : `${period.score}/100`} /><ForecastRow label={t('fishing.statusColumn')} periods={selectedPeriods.map(({ period }) => period)} render={(period) => <span className={`inline-flex rounded-full px-2 py-1 font-semibold ${statusClass(period.status)}`}>{localizedStatus(t, period.status)}</span>} /><ForecastRow label={t('fishing.hero.tideState')} periods={selectedPeriods.map(({ period }) => period)} render={(period) => localizedTideState(t, period.tideState)} /><ForecastRow label={t('waterTemp')} periods={selectedPeriods.map(({ period }) => period)} render={(period) => `${display(period.waterTemperature, 'temperature', locale)}${period.waterTemperature == null ? '' : ` ${units?.temperature ?? ''}`}`} /><ForecastRow label={t('fishing.pressure')} periods={selectedPeriods.map(({ period }) => period)} render={(period) => display(period.pressureTrend, 'barometer', locale)} /><ForecastRow label={t('windSpeed')} periods={selectedPeriods.map(({ period }) => period)} render={(period) => `${display(period.windSpeed, 'wind', locale)}${period.windSpeed == null ? '' : ` ${units?.windSpeed ?? ''}`} ${cardinal(period.windDirection, tCommon)}`} /><ForecastRow label={t('fishing.swellHeight')} periods={selectedPeriods.map(({ period }) => period)} render={(period) => `${display(period.swellHeight, 'default', locale)}${period.swellHeight == null ? '' : ` ${units?.waveHeight ?? ''}`} · ${display(period.swellPeriod, 'default', locale)}${period.swellPeriod == null ? '' : ` ${units?.wavePeriod ?? ''}`}`} /><ForecastRow label={t('fishing.solunar')} periods={selectedPeriods.map(({ period }) => period)} render={(period) => localizedSolunarState(t, period.solunarState)} /></tbody></table></HorizontalScrollNav>{detail && <PeriodDetail period={detail.period} locale={locale} stationTz={stationTz} units={units} />}</>}</CardContent></Card>;
}

function SolunarOverlay({ days, locale, stationTz }: { days: FishingDay[]; locale: string; stationTz: string; }) {
  const { t } = useTranslation('marine');
  return <section aria-labelledby="fishing-solunar-overlay"><h3 id="fishing-solunar-overlay" className="font-semibold">{t('fishing.solunar')}</h3><HorizontalScrollNav ariaLabel={t('fishing.solunarTimelineAriaLabel')}><table className="mt-2 min-w-max w-full border-collapse text-left" style={{ fontSize: 'var(--text-label)' }}><caption className="sr-only">{t('fishing.solunarTimelineAriaLabel')}</caption><thead><tr><th scope="col">{t('fishing.day')}</th><th scope="col"><span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-primary" aria-hidden="true" />{t('fishing.majorPeriod')}</span></th><th scope="col"><span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-muted-foreground" aria-hidden="true" />{t('fishing.minorPeriod')}</span></th></tr></thead><tbody>{days.slice(0, 2).map((day) => <tr key={day.date} className="border-t border-border"><th scope="row">{day.date}</th><td>{day.solunar.majorPeriods.map((range) => <span key={range.start} className="mr-3 inline-flex items-center gap-1"><MoonStars aria-hidden="true" />{timeText(range.start, locale, stationTz)} – {timeText(range.end, locale, stationTz)}</span>)}</td><td>{day.solunar.minorPeriods.map((range) => <span key={range.start} className="mr-3 inline-block">{timeText(range.start, locale, stationTz)} – {timeText(range.end, locale, stationTz)}</span>)}</td></tr>)}</tbody></table></HorizontalScrollNav></section>;
}

function SolunarCard({ days, locale, stationTz, almanac, almanacTomorrow, arcAlmanac, positions, moonNames, loading, error }: { days: FishingDay[]; locale: string; stationTz: string; almanac: AlmanacSnapshot | null; almanacTomorrow: AlmanacSnapshot | null; arcAlmanac: AlmanacSnapshot | null; positions: PositionsSnapshot | null; moonNames: MoonNameData | null; loading: boolean; error: string | null; }) {
  if (!days.length) return null;
  return <SunMoonDetailCard almanac={almanac} almanacTomorrow={almanacTomorrow} arcAlmanac={arcAlmanac} positions={positions} moonNames={moonNames} stationTz={stationTz} loading={loading} error={error} overlay={<SolunarOverlay days={days} locale={locale} stationTz={stationTz} />} />;
}

export function FishingTab({ locationId, alerts = [], selectedSpecies: selectedSpeciesProp, onSelectedSpeciesChange }: FishingTabProps) {
  const { t, i18n } = useTranslation('marine'); const [localSelectedSpecies, setLocalSelectedSpecies] = useState(''); const selectedSpecies = selectedSpeciesProp ?? localSelectedSpecies; const setSelectedSpecies = onSelectedSpeciesChange ?? setLocalSelectedSpecies;
  const { data: rawFishing, units, loading, error, refetch } = useFishingDetail(locationId, selectedSpecies || null); const { data: rawMarine } = useMarineDetail(locationId); const { data: station } = useStation(); const fishing = rawFishing as unknown as FishingData | null; const marine = rawMarine as unknown as { observation?: components['schemas']['MarineObservation'] | null } | null; const unitMap = units as Record<string, string> | undefined; const stationTz = station?.timezone ?? 'UTC';
  const fishingCoordinates = fishing?.coordinates?.lat != null && fishing.coordinates.lon != null ? { lat: fishing.coordinates.lat, lon: fishing.coordinates.lon } : undefined; const almanacDate = fishing?.days[0]?.date ?? ''; const almanacTomorrowDate = fishing?.days[1]?.date ?? (almanacDate ? addDays(almanacDate, 1) : ''); const almanac = useAlmanac(almanacDate || undefined, fishingCoordinates); const almanacTomorrow = useAlmanac(almanacTomorrowDate || undefined, fishingCoordinates); const smartAlmanac = useSmartAlmanac(fishingCoordinates, almanacDate || undefined); const positions = useAlmanacPositions(fishingCoordinates); const moonNames = useAlmanacMoonNames(); const species = useMemo(() => fishing?.species ?? [], [fishing]);
  useEffect(() => { if (species.length && !species.includes(selectedSpecies)) setSelectedSpecies(species[0]); }, [selectedSpecies, setSelectedSpecies, species]);
  if (loading) return <span role="status" className="sr-only">{t('fishing.loading')}</span>; if (error) return <div role="alert"><p className="text-destructive">{t('fishing.unableToLoad')}</p><button type="button" onClick={refetch} className="focus-visible:ring-2 focus-visible:ring-ring">{t('lastUpdated', { time: '' })}</button></div>; if (!fishing) return <p className="text-muted-foreground">{t('fishing.noData')}</p>;
  return <div className="flex flex-col gap-[var(--gap-grid)]"><AlertsPanel alerts={alerts} filterTypes={FISHING_ALERT_TYPES} /><MarineCurrentConditionsCard observation={marine?.observation} locale={i18n.language} stationTz={stationTz} units={unitMap} title={t('fishing.currentConditions')} /><FishingForecastCard data={fishing} selectedSpecies={selectedSpecies} onSelectedSpeciesChange={setSelectedSpecies} locale={i18n.language} stationTz={stationTz} units={unitMap} /><SolunarCard days={fishing.days} locale={i18n.language} stationTz={stationTz} almanac={almanac.data} almanacTomorrow={almanacTomorrow.data} arcAlmanac={smartAlmanac.data} positions={positions.data ?? null} moonNames={moonNames.data} loading={almanac.loading} error={almanac.error?.message ?? null} /><Card footprint="full"><CardHeader><CardTitle as="h3">{t('fishing.tides')}</CardTitle></CardHeader><CardContent><TideChart predictions={fishing.tidePredictions.map((prediction) => ({ ...prediction, type: prediction.type ?? null }))} locale={i18n.language} stationTz={stationTz} heightUnit={unitMap?.height ?? 'ft'} ariaLabel={t('fishing.tideChartAriaLabel', { location: fishing.locationName })} /></CardContent></Card></div>;
}

export default FishingTab;
