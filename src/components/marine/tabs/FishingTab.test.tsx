import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { FishingTab } from './FishingTab';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${Object.values(values).join(' ')}` : key, i18n: { language: 'en' } }) }));
vi.mock('@/components/ui/card', () => ({ Card: ({ children }: { children: ReactNode }) => <section>{children}</section>, CardHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>, CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>, CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3> }));
vi.mock('@/components/layout/grid', () => ({ Grid: ({ children }: { children: ReactNode }) => <div data-testid="marine-grid">{children}</div> }));
vi.mock('@/components/ui/horizontal-scroll-nav', () => ({ HorizontalScrollNav: ({ children }: { children: ReactNode }) => <div data-testid="horizontal-periods">{children}</div> }));
vi.mock('./shared/AlertsPanel', () => ({ AlertsPanel: () => <div data-testid="alerts" /> }));
vi.mock('./shared/TideChart', () => ({ TideChart: () => <div data-testid="tides" /> }));
vi.mock('../shared/MarineCurrentConditionsCard', () => ({ MarineCurrentConditionsCard: () => <section data-testid="current-conditions" /> }));
vi.mock('../shared/MarineStatTile', () => ({ MarineStatTile: ({ value }: { value: ReactNode }) => <span>{value}</span> }));
vi.mock('../../almanac/SunMoonDetailCard', () => ({ SunMoonDetailCard: () => <section data-testid="sun-moon" /> }));
const period = { periodStart: '2026-09-09T12:00:00Z', periodEnd: '2026-09-09T15:00:00Z', periodLabel: 'Morning', selectedSpecies: 'kelp_bass', profileLevel: 'direct_species', score: 72, status: 'active', coreScore: 70, temperatureSuitability: 0.8, tideCurrentSuitability: 0.7, pressureSuitability: 0.6, factorProvenance: { temperature: { available: false }, tideCurrent: { available: false }, pressure: { available: false } }, pressureTrend: null, tideState: 'rising', solunarState: 'major', appliedAdjustments: [], hardStopReason: null, waterTemperature: 18, waterTemperatureProvenance: { available: false }, conditionsText: 'Active because temperature and the incoming tide support kelp bass.', windSpeed: 5, windDirection: 90, windGust: 7, weatherProvenance: { available: false }, swellHeight: 1, swellPeriod: 8, swellProvenance: { available: false } };
vi.mock('../../../hooks/useWeatherData', () => ({
  useFishingDetail: () => ({ data: { locationName: 'Harbour', coordinates: { lat: 1, lon: 2 }, species: ['kelp_bass'], days: [{ date: '2026-09-09', periods: [period], solunar: { majorPeriods: [], minorPeriods: [] } }], tidePredictions: [] }, units: { temperature: '°C', windSpeed: 'kt', waveHeight: 'ft', wavePeriod: 's', height: 'ft' }, loading: false, error: null, refetch: vi.fn() }),
  useMarineDetail: () => ({ data: { observation: null } }), useStation: () => ({ data: { timezone: 'UTC' } }), useAlmanac: () => ({ data: null, loading: false, error: null }), useAlmanacMoonNames: () => ({ data: null }), useAlmanacPositions: () => ({ data: null }),
}));
vi.mock('../../../hooks/useSmartAlmanac', () => ({ useSmartAlmanac: () => ({ data: null }) }));

describe('FishingTab presentation', () => {
  it('uses accessible species-aware period controls linked to their detail region', () => {
    const { getByRole, getByTestId, getByText } = render(<FishingTab locationId="harbour" />);
    const control = getByRole('button', { name: /fishing\.periodControlAriaLabel.*kelp bass.*72\/100/i });
    expect(control.getAttribute('aria-controls')).toMatch(/^fishing-period-detail-/);
    fireEvent.click(control);
    expect(getByText('fishing.forecastTitle')).toBeTruthy();
    expect(getByTestId('marine-grid')).toBeTruthy();
    expect(document.getElementById(control.getAttribute('aria-controls') ?? '')).toBeTruthy();
  });
});
