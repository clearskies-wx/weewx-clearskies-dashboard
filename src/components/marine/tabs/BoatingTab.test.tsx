import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { BoatingTab } from './BoatingTab';

const mockState = vi.hoisted(() => ({ error: false, refetch: vi.fn() }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${Object.values(values).join(' ')}` : key, i18n: { language: 'en' } }) }));
vi.mock('@/components/ui/card', () => ({ Card: ({ children, footprint }: { children: ReactNode; footprint?: string }) => <section data-footprint={footprint}>{children}</section>, CardHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>, CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>, CardTitle: ({ children, as }: { children: ReactNode; as?: 'h3' | 'h4' }) => as === 'h4' ? <h4>{children}</h4> : <h3>{children}</h3> }));
vi.mock('@/components/layout/grid', () => ({ Grid: ({ children }: { children: ReactNode }) => <div data-testid="marine-grid">{children}</div> }));
vi.mock('@/components/ui/horizontal-scroll-nav', () => ({ HorizontalScrollNav: ({ children, ariaLabel }: { children: ReactNode; ariaLabel: string }) => <div data-testid="horizontal-periods" role="region" aria-label={ariaLabel}>{children}</div> }));
vi.mock('./shared/AlertsPanel', () => ({ AlertsPanel: () => <div data-testid="alerts" /> }));
vi.mock('./shared/TideChart', () => ({ TideChart: () => <div data-testid="tides" /> }));
vi.mock('../shared/MarineCurrentConditionsCard', () => ({ MarineCurrentConditionsCard: () => <section data-testid="current-conditions" /> }));
vi.mock('../shared/MarineStatTile', () => ({ MarineStatTile: ({ value }: { value: ReactNode }) => <span>{value}</span> }));
vi.mock('../../../hooks/useWeatherData', () => ({
  useMarineDetail: () => ({ data: { locationName: 'Harbour', observation: null, regularForecast: [{ validTime: '2026-09-09T12:00:00Z', outTemp: 20, windSpeed: 4, windDir: 90, windGust: 7, weatherText: 'Clear', source: 'provider', marineAdditions: { wind: 'NW 10 kt', seas: '2 ft', visibility: '6 nm', weather: 'Patchy fog after midnight' } }], offshoreObservations: { selectionState: 'observations_available', observations: [{ stationId: 'BUOY-1', distanceKm: 4, dataState: 'no_observation', source: 'unavailable', validTime: null }] } }, units: { temperature: '°C', windSpeed: 'kt', height: 'ft' }, loading: false, error: mockState.error ? new Error('unavailable') : null, refetch: mockState.refetch }),
  useTideDetail: () => ({ data: { predictions: [] } }),
  useStation: () => ({ data: { timezone: 'UTC' } }),
}));

describe('BoatingTab presentation', () => {
  beforeEach(() => { mockState.error = false; mockState.refetch.mockReset(); });

  it('uses horizontally scrollable shared period cards instead of a primary forecast table', () => {
    const { container, getByTestId, getByText } = render(<BoatingTab locationId="harbour" />);
    expect(getByTestId('marine-grid')).toBeTruthy();
    expect(getByText('boating.forecastTitle')).toBeTruthy();
    expect(container.querySelector('table')).toBeNull();
    expect(getByTestId('horizontal-periods')).toBeTruthy();
    expect(getByTestId('boating-period-cards').querySelectorAll('[data-footprint="tile"]')).toHaveLength(1);
    expect(getByTestId('boating-period-cards').querySelector('article')).toBeNull();
  });

  it('keeps the period detail button linked to its expanded detail region', () => {
    const { getByRole } = render(<BoatingTab locationId="harbour" />);
    const control = getByRole('button', { name: /boating\.periodControlAriaLabel/i });
    expect(control.getAttribute('aria-controls')).toMatch(/^boating-period-detail-/);
  });

  it('uses the localized retry action after an error', () => {
    mockState.error = true;
    const { getByRole } = render(<BoatingTab locationId="harbour" />);
    fireEvent.click(getByRole('button', { name: 'retry' }));
    expect(mockState.refetch).toHaveBeenCalledOnce();
  });

  it('makes the selected offshore station state explicit', () => {
    const { getByText } = render(<BoatingTab locationId="harbour" />);
    expect(getByText('boating.offshoreDataState.no_observation')).toBeTruthy();
  });
});
