// card-registry.ts — Combines card metadata with lazy React component references.
// Per §8 Card Plugin Contract in DASHBOARD-MANUAL.md.
// This file HAS React imports (lazy). For the zero-React metadata, see card-metadata.ts.

import type { ComponentType, ReactNode } from 'react';
import { lazy } from 'react';
import type { CardType, CardMetadata, CardLayout } from './card-metadata';
import { CARD_METADATA } from './card-metadata';

/**
 * Data bag keyed by API endpoint path.
 * The Now page container fetches each unique endpoint once and places the
 * response under its path key. Cards self-extract the fields they need.
 * Loose typing is deliberate — a strongly-typed bag would re-couple the
 * container to every endpoint's response shape.
 */
export type DataBag = Record<string, unknown>;

/**
 * Uniform props shape every card component must accept.
 * Per §8 Card Plugin Contract in DASHBOARD-MANUAL.md.
 */
export interface CardComponentProps {
  dataBag: DataBag;
  layout: CardLayout;
  stationTz: string;
  footer?: ReactNode;
}

/**
 * Full registration entry: metadata + lazy component reference.
 */
export interface CardRegistration extends CardMetadata {
  component: ComponentType<CardComponentProps>;
}

// ---------------------------------------------------------------------------
// Lazy component imports for all 14 built-in cards.
//
// Each card exposes a `default` export typed as an overloaded function that
// accepts BOTH CardComponentProps and its legacy props signature. TypeScript's
// overload type inference makes the function type the intersection of all
// overloads, which is not directly assignable to ComponentType<CardComponentProps>
// without a cast. The single `as ComponentType<CardComponentProps>` cast here
// is safe because the first overload of each card guarantees acceptance of
// CardComponentProps. The `as unknown` intermediate is required by TypeScript
// when overloaded function types are involved.
//
// This is the correct pattern as of T0B.2 — the cast documents the intentional
// dual-signature design, not a workaround for a missing overload.
// ---------------------------------------------------------------------------

/** Helper: wraps a lazy import to produce ComponentType<CardComponentProps>. */
function lazyCard<T extends ComponentType<CardComponentProps>>(
  importer: () => Promise<{ default: T }>
): ComponentType<CardComponentProps> {
  return lazy(importer) as unknown as ComponentType<CardComponentProps>;
}

const CurrentConditionsLazy = lazyCard(
  () => import('../components/current-conditions-card')
);

const NowForecastLazy = lazyCard(
  () => import('../components/forecast/NowForecastCard')
);

const WindCompassLazy = lazyCard(
  () => import('../components/WindCompassCard')
);

const TodaysHighlightsLazy = lazyCard(
  () => import('../components/todays-highlights-card')
);

const PrecipitationLazy = lazyCard(
  () => import('../components/precipitation-card')
);

const BarometerLazy = lazyCard(
  () => import('../components/barometer-card')
);

const SolarRadiationLazy = lazyCard(
  () => import('../components/solar-radiation-card')
);

const UvIndexLazy = lazyCard(
  () => import('../components/uv-index-card')
);

const AqiLazy = lazyCard(
  () => import('../components/aqi-card')
);

const SunMoonLazy = lazyCard(
  () => import('../components/sun-moon-card')
);

const LightningLazy = lazyCard(
  () => import('../components/lightning-card')
);

const EarthquakeLazy = lazyCard(
  () => import('../components/earthquake-card')
);

const RadarLazy = lazyCard(
  () => import('../components/shared/radar-card')
);

const WebcamLazy = lazyCard(
  () => import('../components/webcam-card')
);

const MarineSummaryLazy = lazyCard(
  () => import('../components/marine-summary-card')
);

// ---------------------------------------------------------------------------
// Registry map — populated at module load time.
// ---------------------------------------------------------------------------

const CARD_REGISTRY = new Map<CardType, CardRegistration>();

function register(type: CardType, component: ComponentType<CardComponentProps>): void {
  CARD_REGISTRY.set(type, { ...CARD_METADATA[type], component });
}

register("current-conditions", CurrentConditionsLazy);
register("now-forecast", NowForecastLazy);
register("wind-compass", WindCompassLazy);
register("todays-highlights", TodaysHighlightsLazy);
register("precipitation", PrecipitationLazy);
register("barometer", BarometerLazy);
register("solar-radiation", SolarRadiationLazy);
register("uv-index", UvIndexLazy);
register("aqi", AqiLazy);
register("sun-moon", SunMoonLazy);
register("lightning", LightningLazy);
register("earthquake", EarthquakeLazy);
register("radar", RadarLazy);
register("webcam", WebcamLazy);
register("marine-summary", MarineSummaryLazy);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the full registration (metadata + component) for a card type. */
export function getCard(type: CardType): CardRegistration | undefined {
  return CARD_REGISTRY.get(type);
}

/** Returns all registered cards in insertion order. */
export function getAllCards(): CardRegistration[] {
  return Array.from(CARD_REGISTRY.values());
}

/**
 * Returns only built-in cards.
 * Same as getAllCards() for now; will differ when third-party plugin cards
 * are supported in a future version.
 */
export function getBuiltinCards(): CardRegistration[] {
  return getAllCards();
}
