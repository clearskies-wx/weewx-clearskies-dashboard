// eclipses.ts — mock EclipseData

import type { EclipseData } from '../api/types';

export const mockEclipses: EclipseData = {
  eclipses: [
    { date: '2026-03-03', type: 'total' },
    { date: '2026-08-28', type: 'partial' },
  ],
};
