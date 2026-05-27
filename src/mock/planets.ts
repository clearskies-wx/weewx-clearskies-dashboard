// planets.ts — mock PlanetsVisible data

import type { PlanetsVisible } from '../api/types';

export const mockPlanets: PlanetsVisible = {
  evening: [
    { name: 'Venus', magnitude: -4.2, rise: '2026-05-27T20:15:00Z', set: '2026-05-28T02:30:00Z' },
    { name: 'Mars', magnitude: 1.1, rise: '2026-05-27T14:00:00Z', set: '2026-05-27T23:45:00Z' },
  ],
  morning: [
    { name: 'Jupiter', magnitude: -2.1, rise: '2026-05-27T03:20:00Z', set: '2026-05-27T12:10:00Z' },
    { name: 'Saturn', magnitude: 0.8, rise: '2026-05-27T01:45:00Z', set: '2026-05-27T11:05:00Z' },
  ],
  allNight: [],
};
