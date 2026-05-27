// climatology.ts — mock ClimatologyMonthly data

import type { ClimatologyMonthly } from '../api/types';

export const mockClimatology: ClimatologyMonthly = {
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  avgHighTemp: [38, 42, 52, 63, 73, 81, 85, 83, 76, 65, 53, 41],
  avgLowTemp: [24, 26, 34, 43, 53, 62, 66, 65, 57, 46, 37, 28],
  avgDewpoint: [19, 22, 30, 39, 50, 59, 63, 62, 55, 43, 33, 23],
  avgRainfall: [3.2, 2.8, 3.5, 3.8, 4.1, 3.9, 4.2, 3.7, 3.4, 3.1, 3.3, 3.0],
};
