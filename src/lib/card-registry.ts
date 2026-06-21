// card-registry.ts — Combines card metadata with lazy React component references.
// Per §8 Card Plugin Contract in DASHBOARD-MANUAL.md.
// This file HAS React imports (lazy). For the zero-React metadata, see card-metadata.ts.

import type { ComponentType } from 'react';
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
// Type assertions (`as unknown as ComponentType<CardComponentProps>`) are a
// deliberate bridge: existing card components still use their old props
// interfaces. T0B.2 will update each component to accept CardComponentProps
// and remove these assertions.
// ---------------------------------------------------------------------------

const CurrentConditionsLazy = lazy(() =>
  import('../components/current-conditions-card').then(m => ({
    default: m.CurrentConditionsCard as unknown as ComponentType<CardComponentProps>,
  }))
);

const NowForecastLazy = lazy(() =>
  import('../components/forecast/NowForecastCard').then(m => ({
    default: m.NowForecastCard as unknown as ComponentType<CardComponentProps>,
  }))
);

const WindCompassLazy = lazy(() =>
  import('../components/WindCompassCard').then(m => ({
    default: m.WindCompassCard as unknown as ComponentType<CardComponentProps>,
  }))
);

const TodaysHighlightsLazy = lazy(() =>
  import('../components/todays-highlights-card').then(m => ({
    default: m.TodaysHighlightsCard as unknown as ComponentType<CardComponentProps>,
  }))
);

const PrecipitationLazy = lazy(() =>
  import('../components/precipitation-card').then(m => ({
    default: m.PrecipitationCard as unknown as ComponentType<CardComponentProps>,
  }))
);

const BarometerLazy = lazy(() =>
  import('../components/barometer-card').then(m => ({
    default: m.BarometerCard as unknown as ComponentType<CardComponentProps>,
  }))
);

const SolarRadiationLazy = lazy(() =>
  import('../components/solar-radiation-card').then(m => ({
    default: m.SolarRadiationCard as unknown as ComponentType<CardComponentProps>,
  }))
);

const UvIndexLazy = lazy(() =>
  import('../components/uv-index-card').then(m => ({
    default: m.UvIndexCard as unknown as ComponentType<CardComponentProps>,
  }))
);

const AqiLazy = lazy(() =>
  import('../components/aqi-card').then(m => ({
    default: m.AqiCard as unknown as ComponentType<CardComponentProps>,
  }))
);

const SunMoonLazy = lazy(() =>
  import('../components/sun-moon-card').then(m => ({
    default: m.SunMoonCard as unknown as ComponentType<CardComponentProps>,
  }))
);

const LightningLazy = lazy(() =>
  import('../components/lightning-card').then(m => ({
    default: m.LightningCard as unknown as ComponentType<CardComponentProps>,
  }))
);

const EarthquakeLazy = lazy(() =>
  import('../components/earthquake-card').then(m => ({
    default: m.EarthquakeCard as unknown as ComponentType<CardComponentProps>,
  }))
);

const RadarLazy = lazy(() =>
  import('../components/shared/radar-card').then(m => ({
    default: m.RadarCard as unknown as ComponentType<CardComponentProps>,
  }))
);

const WebcamLazy = lazy(() =>
  import('../components/webcam-card').then(m => ({
    default: m.WebcamCard as unknown as ComponentType<CardComponentProps>,
  }))
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
