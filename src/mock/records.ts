// records.ts — mock RecordsBundle
// Types are now imported from ../api/types.

export type { RecordEntry, RecordsBundle } from '../api/types';
import type { RecordsBundle } from '../api/types';

export const mockRecords: RecordsBundle = {
  period: 'all-time',
  sections: {
    temperature: [
      {
        label: 'Highest Temperature',
        canonicalField: 'outTemp',
        value: 104.2,
        observedAt: '2024-07-21T18:30:00Z',
        brokenInLast30Days: false,
      },
      {
        label: 'Lowest Temperature',
        canonicalField: 'outTemp',
        value: -8.1,
        observedAt: '2025-01-20T06:15:00Z',
        brokenInLast30Days: false,
      },
    ],
  },
};
