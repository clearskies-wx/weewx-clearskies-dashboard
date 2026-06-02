// alerts.ts — mock AlertRecord[]
// Types are now imported from ../api/types.

export type { AlertRecord } from '../api/types';
import type { AlertRecord } from '../api/types';

export const mockAlerts: AlertRecord[] = [
  {
    id: 'NWS-HEAT-001',
    headline: 'Heat Advisory in effect until 8 PM EDT Sunday',
    description: 'Hot conditions expected. Drink plenty of fluids, stay in air-conditioned rooms, stay out of the sun, and check on relatives and neighbors.',
    severityLevel: 2,
    severityLabel: 'Advisory',
    alertSystem: 'nws',
    hazardType: null,
    nativeName: null,
    color: null,
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
