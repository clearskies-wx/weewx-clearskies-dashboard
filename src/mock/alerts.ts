// alerts.ts — mock AlertRecord[]
// Type matches OpenAPI v1 AlertRecord schema.

export interface AlertRecord {
  id: string;
  headline: string;
  description?: string;
  severity: 'advisory' | 'watch' | 'warning';
  urgency: string | null;
  certainty: string | null;
  event: string;
  effective: string;
  expires: string | null;
  senderName: string | null;
  areaDesc: string | null;
  category: string | null;
  source: string;
}

export const mockAlerts: AlertRecord[] = [
  {
    id: 'NWS-HEAT-001',
    headline: 'Heat Advisory in effect until 8 PM EDT Sunday',
    description: 'Hot conditions expected. Drink plenty of fluids, stay in air-conditioned rooms, stay out of the sun, and check on relatives and neighbors.',
    severity: 'advisory',
    urgency: 'Expected',
    certainty: 'Likely',
    event: 'Heat Advisory',
    effective: '2026-05-18T10:00:00Z',
    expires: '2026-05-19T00:00:00Z',
    senderName: 'NWS New York NY',
    areaDesc: 'Northern New Jersey',
    category: 'Met',
    source: 'nws',
  },
];
