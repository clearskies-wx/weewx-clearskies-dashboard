// archive.ts — mock ArchiveRecord[]
// Types are now imported from ../api/types.

export type { ArchiveRecord } from '../api/types';
import type { ArchiveRecord } from '../api/types';

function generateArchiveData(): ArchiveRecord[] {
  const points: ArchiveRecord[] = [];
  const baseTime = new Date('2026-05-17T17:00:00Z');

  for (let i = 0; i < 96; i++) {
    const timestamp = new Date(baseTime.getTime() + i * 15 * 60 * 1000).toISOString();
    const hourOfDay = (i * 0.25) % 24;

    const tempMin = 62;
    const tempMax = 78;
    const tempMid = (tempMin + tempMax) / 2;
    const tempAmp = (tempMax - tempMin) / 2;
    const tempPhase = (hourOfDay - 14) * (Math.PI / 12);
    const noise = (Math.random() - 0.5) * 3;
    const outTemp = Math.round((tempMid + tempAmp * Math.sin(tempPhase) + noise) * 10) / 10;

    const isAfternoon = hourOfDay >= 12 && hourOfDay <= 17;
    const baseWind = isAfternoon ? 8 + Math.random() * 7 : 4 + Math.random() * 6;
    const windSpeed = Math.round(baseWind * 10) / 10;
    const gustFactor = 1.3 + Math.random() * 0.5;
    const windGust = Math.round(windSpeed * gustFactor * 10) / 10;

    const windDir = Math.round(200 + (hourOfDay / 24) * 60);

    const barometer = Math.round((30.08 + (i / 96) * 0.06) * 100) / 100;

    const showerStart = 55;
    const showerEnd = 59;
    const rain = i >= showerStart && i <= showerEnd
      ? Math.round((0.01 + Math.random() * 0.02) * 100) / 100
      : 0;

    const solarNoonHour = 12;
    const solarAngle = Math.max(0, Math.sin(((hourOfDay - solarNoonHour) / 12) * Math.PI));
    const isNight = hourOfDay < 5.5 || hourOfDay > 20.5;
    const radiation = isNight ? 0 : Math.round(solarAngle * 900);
    const UV = isNight ? 0 : Math.round(solarAngle * 9 * 10) / 10;

    points.push({
      timestamp,
      outTemp,
      windSpeed,
      windDir,
      windGust,
      barometer,
      rain,
      radiation,
      UV,
    });
  }

  return points;
}

export const mockArchiveData: ArchiveRecord[] = generateArchiveData();
