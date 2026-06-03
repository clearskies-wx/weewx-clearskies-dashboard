// lightning-card.tsx — Lightning activity tile for the Now page.
//
// Layout (P7: scatter chart upper ~70%, icon+stats row centered below):
//   - Card footprint "tile" (1 column, ADR-051).
//   - Title: "Lightning" — text-only, Manrope 600 via font-heading.
//   - Upper zone: Recharts ScatterChart of recent strike history (24h rolling
//     window). X = time, Y = distance. When no data, centered "No activity" text.
//   - Lower zone: flex row — Phosphor lightning SVG icon (22px, aria-hidden) +
//     stats line ("<N> /hr · <N> /24h") + "Nearest: X mi" sub-line.
//
// Props:
//   observation  — current Observation (for lightningStrikeHistory)
//   lightning    — LightningData (count1h, count24h, nearestDistanceKm)
//   loading      — shows skeleton
//   error        — shows error text (no retry; lightning is best-effort)
//
// A11y (WCAG 2.1 AA):
//   - Chart container has aria-label summarising the data (§5.5: complex graphic).
//   - SR-only data table mirrors the history array for non-sighted users (§5.5).
//   - Lightning SVG icon: aria-hidden="true" + focusable="false" (decorative).
//   - Stat numbers are in a <span> with sufficient contrast; muted sub-text
//     satisfies 4.5:1 against card glass background (verified in ADR-048 tokens).
//   - aria-live="polite" on the stats zone for SSE live updates (ADR-041).
//   - aria-busy on Card during loading.
//
// Per ADR-042: zero unit knowledge. nearestDistanceKm is rendered as-is (km);
// the BFF owns distance unit conversion. The "km" suffix is appended here only
// as a fallback display unit — a future ADR-042 extension point.

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import {
  Card,
  CardHeader,
  CardContent,
} from './ui/card';
import type { Observation, LightningData } from '../api/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StrikePoint {
  /** Unix timestamp in milliseconds — Recharts XAxis uses numeric domain. */
  t: number;
  /** Distance in km. */
  d: number;
  /** ISO string for the SR table. */
  timeIso: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 24-hour window width in milliseconds. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LightningSkeleton() {
  return (
    <div
      className="animate-pulse rounded-lg bg-muted h-32"
      aria-hidden="true"
    />
  );
}

/** Phosphor lightning bolt — inline SVG, 22px, matches the icon set (ADR-050). */
function LightningIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="22"
      height="22"
      viewBox="0 0 256 256"
      fill="currentColor"
      style={{ opacity: 0.7, flexShrink: 0 }}
    >
      <path d="M215.79,118.17a8,8,0,0,0-5.17-5.66L153.18,90.9l14.2-73.81a8,8,0,0,0-13.31-7.59L60.54,111.06A8,8,0,0,0,66,124.61l57.63,21.61L109.4,220.15a8,8,0,0,0,13.32,7.59l93.54-101.56A8,8,0,0,0,215.79,118.17Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// LightningCard
// ---------------------------------------------------------------------------

export interface LightningCardProps {
  observation: Observation | null;
  lightning: LightningData | null;
  loading?: boolean;
  error?: string | null;
}

export function LightningCard({
  observation,
  lightning,
  loading = false,
  error = null,
}: LightningCardProps) {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Build scatter data from lightningStrikeHistory, clamped to 24h window.
  const strikePoints: StrikePoint[] = useMemo(() => {
    const history = observation?.lightningStrikeHistory;
    if (!history || history.length === 0) return [];
    return history
      .map((s) => ({ t: new Date(s.time).getTime(), d: s.distance, timeIso: s.time }))
      .filter((s) => s.t >= windowStart && isFinite(s.t) && isFinite(s.d));
  }, [observation, windowStart]);

  const hasActivity =
    strikePoints.length > 0 ||
    (lightning !== null && (lightning.count1h > 0 || lightning.count24h > 0));

  // Nearest distance display: BFF supplies km; render as-is.
  const nearestDisplay =
    lightning?.nearestDistanceKm != null
      ? `${lightning.nearestDistanceKm.toFixed(1)} km`
      : null;

  // Accessible chart summary for aria-label.
  const chartAriaLabel =
    strikePoints.length > 0
      ? `Lightning strike history: ${strikePoints.length} strikes in the last 24 hours`
      : 'Lightning strike history: no strikes in the last 24 hours';

  // X-axis domain: [windowStart, now] keeps the right edge pinned to current time.
  const xDomain: [number, number] = [windowStart, now];

  // Y-axis: auto-scale from data, with a sensible minimum extent.
  const yMin = strikePoints.length > 0 ? Math.max(0, Math.min(...strikePoints.map((s) => s.d)) - 5) : 0;
  const yMax = strikePoints.length > 0 ? Math.max(...strikePoints.map((s) => s.d)) + 10 : 50;

  return (
    <Card footprint="tile" aria-busy={loading}>
      <CardHeader>
        {/* Title: text-only per spec. Manrope 600 via font-heading. */}
        <h2 className="font-heading leading-snug font-semibold pb-1.5 border-b border-border" style={{ fontSize: 'var(--text-card-title, 0.82rem)' }}>
          Lightning
        </h2>
      </CardHeader>

      <CardContent>
        {loading ? (
          <>
            <span className="sr-only" role="status">Loading lightning data</span>
            <LightningSkeleton />
          </>
        ) : error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minHeight: 0 }}>

            {/* ── Chart zone (upper ~70%) ────────────────────────────── */}
            <div
              aria-label={chartAriaLabel}
              role="img"
              style={{ width: '100%', flex: 1, minHeight: '180px', position: 'relative' }}
            >
              {!hasActivity ? (
                /* No-activity state: centered text, vertically centred in chart zone */
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                      fontSize: '0.8rem',
                      color: 'var(--muted-foreground)',
                    }}
                  >
                    No activity
                  </span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart
                    margin={{ top: 4, right: 8, bottom: 0, left: -20 }}
                  >
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={xDomain}
                      tickCount={4}
                      tickFormatter={(v: number) => {
                        const d = new Date(v);
                        return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
                      }}
                      tick={{
                        fontFamily: 'var(--font-chart, system-ui, sans-serif)',
                        fontSize: 8,
                        fill: 'var(--muted-foreground)',
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      dataKey="d"
                      type="number"
                      domain={[yMin, yMax]}
                      tickCount={3}
                      tick={{
                        fontFamily: 'var(--font-chart, system-ui, sans-serif)',
                        fontSize: 8,
                        fill: 'var(--muted-foreground)',
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    {/* Minimal tooltip — time + distance. Not keyboard-navigable
                        in Recharts; the SR table below covers non-sighted users. */}
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3', stroke: 'var(--muted-foreground)', strokeOpacity: 0.4 }}
                      contentStyle={{
                        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                        fontSize: '0.75rem',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                      }}
                      formatter={(value, name) =>
                        name === 'd' ? [`${Number(value).toFixed(1)} km`, 'Distance'] : [value, name]
                      }
                      labelFormatter={(label) => new Date(Number(label)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    />
                    <Scatter
                      data={strikePoints}
                      // --gauge-fill maps to the blue accent in the default theme (ADR-048).
                      fill="var(--gauge-fill, #3b82f6)"
                      fillOpacity={0.55}
                      // Equal r on Circle shape ensures circular dots (not ellipses).
                      shape="circle"
                      isAnimationActive={false}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Screen-reader data table — inline sr-only styles (table sr-only ghost text fix). */}
            {strikePoints.length > 0 && (
              <div style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', clipPath: 'inset(50%)', whiteSpace: 'nowrap', margin: '-1px', padding: 0, border: 0 }}>
                <table>
                  <caption>Lightning strike history — last 24 hours</caption>
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Distance (km)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strikePoints.map((s) => (
                      <tr key={s.timeIso}>
                        <td>{new Date(s.timeIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{s.d.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Stats zone (below chart) ────────────────────────────── */}
            <div
              aria-live="polite"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.15rem',
              }}
            >
              {/* Icon + counts row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  color: 'var(--foreground)',
                }}
              >
                <LightningIcon />
                <span
                  style={{
                    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                    fontSize: '0.8125rem',
                    color: 'var(--foreground)',
                  }}
                >
                  {/* Bold numbers, muted separators */}
                  <span
                    style={{
                      fontFamily: 'var(--font-display, system-ui, sans-serif)',
                      fontWeight: 600,
                    }}
                  >
                    {lightning?.count1h ?? 0}
                  </span>
                  <span style={{ color: 'var(--muted-foreground)' }}> /hr</span>
                  <span style={{ color: 'var(--muted-foreground)' }}> · </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-display, system-ui, sans-serif)',
                      fontWeight: 600,
                    }}
                  >
                    {lightning?.count24h ?? 0}
                  </span>
                  <span style={{ color: 'var(--muted-foreground)' }}> /24h</span>
                </span>
              </div>

              {/* Nearest distance sub-line — only when there's actual activity */}
              {hasActivity && nearestDisplay !== null && (
                <span
                  style={{
                    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
                    fontSize: '0.6875rem',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  Nearest: {nearestDisplay}
                </span>
              )}
            </div>

          </div>
        )}
      </CardContent>
    </Card>
  );
}
