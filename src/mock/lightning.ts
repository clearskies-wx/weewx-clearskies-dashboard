// lightning.ts — mock LightningData
// Types are now imported from ../api/types.

export type { LightningData } from '../api/types';
import type { LightningData } from '../api/types';

export const mockLightning: LightningData = {
  count1h: 3,
  count24h: 47,
  nearestDistanceKm: 12.8,
  lastStrikeTime: new Date(Date.now() - 23 * 60 * 1000).toISOString(),
};
