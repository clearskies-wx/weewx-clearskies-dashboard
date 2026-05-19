// records.ts — mock RecordsBundle
// Type matches OpenAPI v1 RecordsBundle / RecordEntry schemas.

export interface RecordEntry {
  label: string;
  canonicalField: string;
  value: number | null;
  observedAt: string | null;
  brokenInLast30Days?: boolean;
}

export interface RecordsBundle {
  period: string;
  sections: Record<string, RecordEntry[]>;
}

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
