import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { FishingTab } from './FishingTab';

const mockState = vi.hoisted(() => ({ error: false, refetch: vi.fn() }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${Object.values(values).join(' ')}` : key, i18n: { language: 'en' } }) }));
vi.mock('@/components/ui/card', () => ({ Card: ({ children, footprint }: { children: ReactNode; footprint?: string }) => <section data-footprint={footprint}>{children}</section>, CardHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>, CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>, CardTitle: ({ children, as }: { children: ReactNode; as?: 'h3' | 'h4' }) => as === 'h4' ? <h4>{children}</h4> : <h3>{children}</h3> }));
vi.mock('@/components/layout/grid', () => ({ Grid: ({ children }: { children: ReactNode }) => <div data-testid="marine-grid">{children}</div> }));
vi.mock('@/components/ui/horizontal-scroll-nav', () => ({ HorizontalScrollNav: ({ children, ariaLabel }: { children: ReactNode; ariaLabel: string }) => <div data-testid="horizontal-periods" role="region" aria-label={ariaLabel}>{children}</div> }));
vi.mock('./shared/AlertsPanel', () => ({ AlertsPanel: () => <div data-testid="alerts" /> }));
vi.mock('./shared/TideChart', () => ({ TideChart: () => <div data-testid="tides" /> }));
vi.mock('../shared/MarineCurrentConditionsCard', () => ({ MarineCurrentConditionsCard: () => <section data-testid="current-conditions" /> }));
vi.mock('../shared/MarineStatTile', () => ({ MarineStatTile: ({ value }: { value: ReactNode }) => <span>{value}</span> }));
vi.mock('../../almanac/SunMoonDetailCard', () => ({ SunMoonDetailCard: ({ overlay }: { overlay: ReactNode }) => <section data-testid="sun-moon">{overlay}</section> }));

const period = {
  periodStart: '2026-09-09T12:00:00Z', periodEnd: '2026-09-09T15:00:00Z', periodLabel: 'Morning', selectedSpecies: 'kelp_bass', profileLevel: 'direct_species', score: 72, status: 'active', coreScore: 70,
  temperatureSuitability: 0.8, tideCurrentSuitability: 0.7, pressureSuitability: 0.6, factorProvenance: { temperature: { available: false }, tideCurrent: { available: false }, pressure: { available: false } }, pressureTrend: null,
  tideState: 'incoming', solunarState: 'major', appliedAdjustments: [], hardStopReason: null, waterTemperature: 18, waterTemperatureProvenance: { available: false }, conditionsText: 'Active because temperature and the incoming tide support kelp bass.',
  windSpeed: 5, windDirection: 90, windGust: 7, weatherProvenance: { available: false }, swellHeight: 1, swellPeriod: 8, swellProvenance: { available: false },
};

vi.mock('../../../hooks/useWeatherData', () => ({
  useFishingDetail: () => ({ data: { locationName: 'Harbour', coordinates: { lat: 1, lon: 2 }, species: ['kelp_bass', 'white_seabass'], days: [{ date: '2026-09-09', periods: [period], solunar: { majorPeriods: [], minorPeriods: [] } }], tidePredictions: [] }, units: { temperature: '°C', windSpeed: 'kt', waveHeight: 'ft', wavePeriod: 's', height: 'ft' }, loading: false, error: mockState.error ? new Error('unavailable') : null, refetch: mockState.refetch }),
  useMarineDetail: () => ({ data: { observation: null } }), useStation: () => ({ data: { timezone: 'UTC' } }), useAlmanac: () => ({ data: null, loading: false, error: null }), useAlmanacMoonNames: () => ({ data: null }), useAlmanacPositions: () => ({ data: null }),
}));
vi.mock('../../../hooks/useSmartAlmanac', () => ({ useSmartAlmanac: () => ({ data: null }) }));

describe('FishingTab presentation', () => {
  beforeEach(() => { mockState.error = false; mockState.refetch.mockReset(); period.tideState = 'incoming'; });

  it('uses scrollable shared-card period strips instead of a primary forecast table', () => {
    const { container, getByTestId } = render(<FishingTab locationId="harbour" />);
    const speciesStrip = getByTestId('fishing-species-strip');
    expect(speciesStrip.getAttribute('class')).toContain('w-max');
    expect(speciesStrip.getAttribute('class')).not.toContain('flex-wrap');
    expect(getByTestId('fishing-period-cards').querySelectorAll('[data-footprint="tile"]')).toHaveLength(1);
    expect(getByTestId('fishing-period-cards').querySelector('article')).toBeNull();
    expect(container.querySelector('table')).toBeTruthy();
  });

  it('uses accessible species-aware period controls linked to their detail region', () => {
    const { getByRole, getByTestId, getByText } = render(<FishingTab locationId="harbour" />);
    const control = getByRole('button', { name: /fishing\.periodControlAriaLabel.*kelp bass.*72\/100/i });
    expect(control.getAttribute('aria-controls')).toMatch(/^fishing-period-detail-/);
    fireEvent.click(control);
    expect(getByText('fishing.forecastTitle')).toBeTruthy();
    expect(getByTestId('marine-grid')).toBeTruthy();
    expect(document.getElementById(control.getAttribute('aria-controls') ?? '')).toBeTruthy();
  });

  it('maps API tide states and uses an honest fallback for an unknown state', () => {
    const { getByText, rerender } = render(<FishingTab locationId="harbour" />);
    expect(getByText('fishing.tideState.incoming')).toBeTruthy();
    period.tideState = 'unrecognized_state';
    rerender(<FishingTab locationId="harbour" />);
    expect(getByText('fishing.tideState.unavailable')).toBeTruthy();
    expect(() => getByText('fishing.tideState.unrecognized_state')).toThrow();
  });

  it('uses the retry action and renders the solunar date through locale-aware formatting', () => {
    const normal = render(<FishingTab locationId="harbour" />);
    expect(normal.getByText('September 9, 2026')).toBeTruthy();
    mockState.error = true;
    const errorView = render(<FishingTab locationId="harbour" />);
    fireEvent.click(errorView.getByRole('button', { name: 'retry' }));
    expect(mockState.refetch).toHaveBeenCalledOnce();
  });
});
