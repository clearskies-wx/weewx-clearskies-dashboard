// radar-card.tsx — Radar card component for the Now page (C5).
//
// Wraps RadarMap in a Card with the standard header (radarTitle i18n key).
// Footprint: wide (2 columns), rowSpan 2.5.
//
// DataBag pattern (T0B.2): self-extracts from dataBag['/api/v1/station']
// to get the station's lat/lon for the map center. Uses props.stationTz
// from CardComponentProps directly for frame timestamp formatting.
//
// Stacking context: className "relative z-0" creates a stacking context to
// contain Leaflet's internal z-indices. min-h-[37.5rem] provides the
// 2.5-row height fallback on mobile where auto-rows:auto makes rowSpan
// inert. md:min-h-0 md:h-auto restores grid control on desktop.
//
// A11y (WCAG 2.1 AA):
//   - Card title uses CardTitle as="h2" (landmark + heading hierarchy).
//   - RadarMap has role="region" + aria-label=radarTitle on its inner div.
//   - Loading state uses aria-busy + TileSkeleton (aria-hidden).
//   - Keyboard: map zoom controls are native Leaflet buttons (focusable).
//   - Animation controls in RadarMap: <button> elements, not <div onClick>.
//   - Expand button: <button> with aria-label, keyboard accessible.

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowsOut } from '@phosphor-icons/react';
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from '../ui/card';
import { RadarMap } from './radar-map';
import type { StationMetadata } from '../../api/types';
import type { CardComponentProps } from '../../lib/card-registry';

// ---------------------------------------------------------------------------
// Skeleton — used while station data is loading
// ---------------------------------------------------------------------------

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-96'}`}
      aria-hidden="true"
    />
  );
}

// ---------------------------------------------------------------------------
// Legacy props interface — kept for any non-Now-page callers.
// ---------------------------------------------------------------------------

export interface RadarCardProps {
  station: StationMetadata | null;
  stationTz: string;
  loading?: boolean;
}

// ---------------------------------------------------------------------------
// Core render logic (shared by both prop shapes)
// ---------------------------------------------------------------------------

function RadarCardContent({ station, stationTz, loading = false }: RadarCardProps) {
  const { t } = useTranslation('radar');
  const navigate = useNavigate();

  return (
    <Card
      footprint="wide"
      rowSpan={2.5}
      className="relative z-0 min-h-[37.5rem] md:min-h-0 md:h-auto"
      aria-busy={loading}
    >
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle as="h2">{t('radarTitle')}</CardTitle>
        <button
          type="button"
          onClick={() => navigate('/radar')}
          aria-label={t('expandRadar')}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowsOut className="h-5 w-5" aria-hidden="true" />
        </button>
      </CardHeader>
      <CardContent className="pt-1">
        {loading || station === null ? (
          <TileSkeleton className="h-96" />
        ) : (
          <RadarMap
            center={[station.latitude, station.longitude]}
            stationTz={stationTz}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DataBag-aware component (CardComponentProps — T0B.2 contract)
// ---------------------------------------------------------------------------

export function RadarCard(props: CardComponentProps): React.ReactElement;
export function RadarCard(props: RadarCardProps): React.ReactElement;
export function RadarCard(props: CardComponentProps | RadarCardProps): React.ReactElement {
  if ('dataBag' in props) {
    // DataBag path — self-extract station coords from /api/v1/station
    const stationData = props.dataBag['/api/v1/station'] as {
      data?: StationMetadata | null;
      loading?: boolean;
    } | undefined;

    return (
      <RadarCardContent
        station={stationData?.data ?? null}
        loading={stationData?.loading ?? true}
        stationTz={props.stationTz}
      />
    );
  }
  // Legacy path — explicit props
  return (
    <RadarCardContent
      station={props.station}
      stationTz={props.stationTz}
      loading={props.loading}
    />
  );
}

export default RadarCard;
