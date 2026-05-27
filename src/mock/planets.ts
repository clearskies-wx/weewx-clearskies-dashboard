// planets.ts — mock PlanetsVisible data

import type { PlanetsVisible } from '../api/types';

export const mockPlanets: PlanetsVisible = {
  evening: [
    { name: 'Venus', altitude: 35.2, direction: 'Southwest', rise: '2026-05-27T20:15:00Z', set: '2026-05-28T02:30:00Z' },
    { name: 'Mars', altitude: 22.8, direction: 'West', rise: '2026-05-27T14:00:00Z', set: '2026-05-27T23:45:00Z' },
  ],
  morning: [
    { name: 'Jupiter', altitude: 28.5, direction: 'East', rise: '2026-05-27T03:20:00Z', set: '2026-05-27T12:10:00Z' },
    { name: 'Saturn', altitude: 41.0, direction: 'Southeast', rise: '2026-05-27T01:45:00Z', set: '2026-05-27T11:05:00Z' },
  ],
  allNight: [],
};
