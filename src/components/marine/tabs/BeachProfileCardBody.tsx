// BeachProfileCardBody.tsx — Beach Profile card content, extracted from
// SurfingTab.tsx (SURF-PUBLISH-RESULTS-ONLY §3.6, 2026-07-25).
//
// Why extracted: SurfingTab.tsx renders from 7 data hooks, which makes it
// expensive to mount just to test one card's error/unavailable/ok branch
// selection. This is a pure UI decomposition — same rendering job, same
// data flow, no contract or responsibility change — split out so the
// branch logic (computeBeachProfileState) and its render (this component)
// are independently unit-testable.
//
// The contract this enforces (from the API's beach_profile.py):
//   - HTTP 404 (config error) / network failure -> `error` -> role="alert",
//     destructive styling. Must look and read differently from...
//   - HTTP 200 with modelStatus: "unavailable" -> `unavailable` -> muted
//     informational text naming the model gap specifically. NOT an error
//     tile, NOT a silently blank chart.
//   - HTTP 200 with modelStatus: "ok" and a non-empty transect -> `ok` ->
//     the real chart.
//   - Anything else (no data yet, ok-but-empty transect) -> `empty` ->
//     the pre-existing generic empty-state text.
//
// Check order is load-bearing: error MUST be checked before modelStatus,
// because an error response has no modelStatus at all (undefined), and
// checking modelStatus first would silently fall through to "empty"
// instead of surfacing the real fetch failure.

import { useTranslation } from 'react-i18next';
import { Warning } from '@phosphor-icons/react';
import { BeachProfileChart } from './BeachProfileChart';
import type { BeachProfileData, BeachProfileDataOk } from '../../../api/types';

export type BeachProfileState = 'error' | 'unavailable' | 'ok' | 'empty';

/**
 * computeBeachProfileState — the discriminant driving BeachProfileCardBody.
 *
 * Order matters (lead call, 2026-07-25): check `profileError` FIRST. An
 * error response never carries `modelStatus` (the fetch failed before any
 * envelope arrived), so checking modelStatus before the error would read a
 * field off a value that was never populated for that reason, not because
 * the model succeeded with nothing to say.
 */
export function computeBeachProfileState(
  profileData: BeachProfileData | null,
  profileError: Error | null | undefined,
): BeachProfileState {
  if (profileError) return 'error';
  if (profileData?.modelStatus === 'unavailable') return 'unavailable';
  const ok = profileData && profileData.modelStatus === 'ok' ? profileData : null;
  if (ok && ok.transect.length > 0) return 'ok';
  return 'empty';
}

export interface BeachProfileCardBodyProps {
  state: BeachProfileState;
  /** Only read when state === 'ok'. */
  profile: BeachProfileDataOk | null;
  heightUnit: string;
  distanceUnit: string;
  locale: string;
  selectedTransect?: number | 'best_peak' | 'average';
  onTransectChange?: (value: number | 'best_peak' | 'average') => void;
  onRetry: () => void;
}

export function BeachProfileCardBody({
  state,
  profile,
  heightUnit,
  distanceUnit,
  locale,
  selectedTransect,
  onTransectChange,
  onRetry,
}: BeachProfileCardBodyProps) {
  const { t } = useTranslation('marine');
  const { t: tCommon } = useTranslation('common');

  if (state === 'error') {
    return (
      <div role="alert" className="flex items-start gap-2">
        <Warning size={20} aria-hidden="true" className="text-destructive shrink-0 mt-0.5" />
        <div className="flex flex-col gap-2 items-start">
          <p className="text-destructive" style={{ fontSize: 'var(--text-body)' }}>
            {t('surfing.beachProfile.loadError')}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
            style={{ fontSize: 'var(--text-label)' }}
          >
            {tCommon('retry')}
          </button>
        </div>
      </div>
    );
  }

  if (state === 'unavailable') {
    return (
      <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }} aria-live="polite">
        {t('surfing.beachProfile.modelUnavailable')}
      </p>
    );
  }

  if (state === 'ok' && profile) {
    // BD-9 "representative transect" header removed from the render
    // (operator ruling 2026-08-02): "the user of the site will not [know
    // what that means]" — same class of developer/operator-only marker as
    // the heatmap's BD-9 triangle (HeatMapCard.tsx), removed in the same
    // round. `selectedTransect` stays a prop (still drives the chart's own
    // transect selection), just no longer used to gate this header.
    return (
      <div className="flex flex-col gap-2">
        <BeachProfileChart
          transect={profile.transect}
          breakPoints={profile.breakPoints}
          heightUnit={heightUnit}
          distanceUnit={distanceUnit}
          locale={locale}
          tideLevel={profile.tideLevel}
          datum={profile.metadata?.verticalDatum}
          surfZones={profile.surfZones}
          perBreakZones={profile.perBreakZones}
          waterlineDistance={profile.waterlineDistance}
          beachElevation={profile.beachElevation}
          transects={profile.transects}
          selectedTransect={selectedTransect}
          onTransectChange={onTransectChange}
          displayWindowM={profile.metadata?.displayWindowM}
          displayLandwardM={profile.metadata?.displayLandwardM}
        />
      </div>
    );
  }

  return (
    <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
      {t('surfing.beachProfileNoData')}
    </p>
  );
}
