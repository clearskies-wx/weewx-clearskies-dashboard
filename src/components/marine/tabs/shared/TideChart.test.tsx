import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import { TideChart } from './TideChart';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../../../hooks/useWeatherData', () => ({
  useAlmanac: () => ({ data: null }),
}));

vi.mock('recharts', () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ComposedChart: Wrapper,
    Area: Wrapper,
    Line: Wrapper,
    Scatter: Wrapper,
    XAxis: Wrapper,
    YAxis: Wrapper,
    ReferenceLine: Wrapper,
    Legend: Wrapper,
    ResponsiveContainer: Wrapper,
  };
});

describe('TideChart accessibility fallback', () => {
  it('wraps the six-minute fallback table without clipping the table itself and retains the visible extrema table', () => {
    const { container } = render(
      <TideChart
        ariaLabel="Three-day tide forecast"
        locale="en-US"
        stationTz="UTC"
        predictions={[
          { time: '2026-09-09T00:00:00Z', height: 4.2, type: 'high' },
          { time: '2026-09-09T06:00:00Z', height: 0.7, type: 'low' },
        ]}
      />,
    );

    const fallback = Array.from(container.querySelectorAll('table')).find(
      (table) => table.querySelector('caption')?.textContent === 'Three-day tide forecast',
    );
    expect(fallback).toBeDefined();
    expect(fallback?.classList.contains('sr-only')).toBe(false);
    expect(fallback?.parentElement?.classList.contains('sr-only')).toBe(true);

    const visibleTable = container.querySelector('table.w-full.border-collapse');
    expect(visibleTable).toBeDefined();
    expect(within(visibleTable as HTMLTableElement).getByText('tide.tideHigh')).toBeDefined();
    expect(within(visibleTable as HTMLTableElement).getByText('tide.tideLow')).toBeDefined();
    expect(visibleTable?.querySelector('th[scope="row"]')?.textContent).toBe('tide.tideHigh');
    expect(visibleTable?.querySelectorAll('th[scope="row"]')[2]?.textContent).toBe('tide.moonColumn');
  });
});
