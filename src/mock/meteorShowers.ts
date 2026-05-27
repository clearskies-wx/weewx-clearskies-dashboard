// meteorShowers.ts — mock MeteorShowerData

import type { MeteorShowerData } from '../api/types';

export const mockMeteorShowers: MeteorShowerData = {
  showers: [
    {
      name: 'Perseids',
      peakDate: '2026-08-12',
      zhr: 100,
      radiantAltitudeDeg: 60,
      moonIlluminationPercent: 15,
      moonPhase: 'waxing-crescent',
      parentBody: '109P/Swift-Tuttle',
    },
    {
      name: 'Leonids',
      peakDate: '2026-11-17',
      zhr: 15,
      radiantAltitudeDeg: 45,
      moonIlluminationPercent: 40,
      moonPhase: 'first-quarter',
      parentBody: '55P/Tempel-Tuttle',
    },
    {
      name: 'Geminids',
      peakDate: '2026-12-14',
      zhr: 120,
      radiantAltitudeDeg: 70,
      moonIlluminationPercent: 60,
      moonPhase: 'waxing-gibbous',
      parentBody: '3200 Phaethon',
    },
    {
      name: 'eta Aquariids',
      peakDate: '2026-05-06',
      zhr: 50,
      radiantAltitudeDeg: 25,
      moonIlluminationPercent: 80,
      moonPhase: 'waning-gibbous',
      parentBody: '1P/Halley',
    },
  ],
};
