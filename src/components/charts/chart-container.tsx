// chart-container.tsx — T4.1
// Shared chart sizing wrapper used by ConfigDrivenChart and any full-page chart.
// NOT used by Now-page tile-card mini-charts (those use --card-content-max).
//
// Accessibility:
//   - role="img" + aria-label announces the chart as a graphic to screen readers
//     (WCAG 1.1.1 / coding rules §5.5). The caller is responsible for placing a
//     visually-hidden data table OUTSIDE this component as the text alternative.
//   - fullscreenHeight is accepted as a prop for future use; consumers pass a
//     different height value for normal vs. fullscreen modes today.

import * as React from 'react';
import { ResponsiveContainer } from 'recharts';

interface ChartContainerProps {
  height?: number;
  fullscreenHeight?: number;
  ariaLabel: string;
  children: React.ReactNode;
}

/**
 * Shared chart sizing wrapper. Used by ConfigDrivenChart and any full-page
 * chart. NOT used by Now-page tile-card mini-charts (those use --card-content-max).
 */
export function ChartContainer({
  height = 300,
  ariaLabel,
  children,
}: ChartContainerProps) {
  return (
    <div role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="99%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}
