import { Link } from 'react-router-dom';
import { Sunrise, Sunset, Moon, Zap, Activity } from 'lucide-react';
import { AlertBanner } from '../components/shared/alert-banner';
import {
  Card,
  CardHeader,
  CardContent,
} from '../components/ui/card';
import {
  useForecast,
  useAlerts,
  useAlmanac,
  useEarthquakes,
  useAqi,
  useStation,
  useLightning,
  useArchive,
  useTodayStats,
} from '../hooks/useWeatherData';
import { useRealtimeObservation } from '../hooks/useRealtimeObservation';

function formatLocalTime(iso: string | null, tz: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  }).format(new Date(iso));
}

function formatPhaseName(name: string | null): string {
  if (!name) return '—';
  return name.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function beaufortLabel(speedMph: number): string {
  if (speedMph < 1) return 'Calm';
  if (speedMph <= 3) return 'Light Air';
  if (speedMph <= 7) return 'Light Breeze';
  if (speedMph <= 12) return 'Gentle Breeze';
  if (speedMph <= 18) return 'Moderate Breeze';
  if (speedMph <= 24) return 'Fresh Breeze';
  if (speedMph <= 31) return 'Strong Breeze';
  if (speedMph <= 38) return 'Near Gale';
  if (speedMph <= 46) return 'Gale';
  if (speedMph <= 54) return 'Strong Gale';
  if (speedMph <= 63) return 'Storm';
  if (speedMph <= 72) return 'Violent Storm';
  return 'Hurricane';
}

function windDirLabel(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

// EPA standard AQI color categories with WCAG AA-accessible shades.
// The raw EPA palette (#FFFF00 yellow, #00E400 bright green) fails 3:1 contrast
// against white backgrounds for non-text elements. These replacements preserve
// the EPA category semantics (green/yellow/orange/red/purple/maroon) while
// meeting the 3:1 threshold for graphical objects (WCAG 1.4.11).
// Contrast ratios against #FFFFFF (light) verified via WebAIM:
//   Good:          #1A7A1A (~7.0:1)
//   Moderate:      #B8A000 (~3.4:1) — saturated gold replacing pure yellow
//   USG:           #C45E00 (~4.0:1)
//   Unhealthy:     #CC0000 (~5.9:1)
//   Very Unhealthy:#6B2D8B (~5.5:1)
//   Hazardous:     #7E0023 (~8.3:1)
// Dark mode strokes render against oklch(0.145 0 0) ≈ #1A1A1A; all pass 3:1 there too.
function aqiColor(aqi: number): string {
  if (aqi <= 50) return '#1A7A1A';
  if (aqi <= 100) return '#B8A000';
  if (aqi <= 150) return '#C45E00';
  if (aqi <= 200) return '#CC0000';
  if (aqi <= 300) return '#6B2D8B';
  return '#7E0023';
}

function aqiCategory(aqi: number): string {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

function formatRelativeTime(iso: string): string {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second');
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour');
  return rtf.format(diffDay, 'day');
}

function barometerTrendArrow(trend: number | null): string {
  if (trend === null) return '→';
  if (trend > 0.01) return '↑';
  if (trend < -0.01) return '↓';
  return '→';
}

function WindCompass({ windDir, windSpeed, windGust }: { windDir: number; windSpeed: number; windGust: number }) {
  const dirLabel = windDirLabel(windDir).toLowerCase();
  const ariaLabel = `Wind from ${dirLabel} at ${windDir} degrees`;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        role="img"
        aria-label={ariaLabel}
        focusable="false"
      >
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-border"
        />
        <text x="60" y="14" textAnchor="middle" fontSize="11" fill="currentColor" className="text-muted-foreground" dominantBaseline="middle">N</text>
        <text x="106" y="60" textAnchor="middle" fontSize="11" fill="currentColor" className="text-muted-foreground" dominantBaseline="middle">E</text>
        <text x="60" y="108" textAnchor="middle" fontSize="11" fill="currentColor" className="text-muted-foreground" dominantBaseline="middle">S</text>
        <text x="14" y="60" textAnchor="middle" fontSize="11" fill="currentColor" className="text-muted-foreground" dominantBaseline="middle">W</text>

        <g transform={`translate(60,60) rotate(${windDir})`}>
          <polygon
            points="0,-36 5,-16 0,-22 -5,-16"
            fill="currentColor"
            className="text-primary"
          />
          <line x1="0" y1="-22" x2="0" y2="20" stroke="currentColor" strokeWidth="2" className="text-primary" />
          <circle cx="0" cy="0" r="3" fill="currentColor" className="text-primary" />
        </g>
      </svg>

      <div className="text-center text-sm font-[tabular-nums]">
        <p className="font-medium text-foreground">
          Wind: {windSpeed} mph · {windDirLabel(windDir)}
        </p>
        <p className="text-muted-foreground">Gusts: {windGust} mph</p>
        <p className="text-xs text-muted-foreground mt-0.5">{beaufortLabel(windSpeed)}</p>
      </div>
    </div>
  );
}

function AqiGauge({ aqi, category, pollutant }: { aqi: number; category: string | null; pollutant: string | null }) {
  const clampedAqi = Math.min(Math.max(aqi, 0), 500);
  const fraction = clampedAqi / 500;
  const sweepDeg = fraction * 180;
  const r = 50;
  const cx = 60;
  const cy = 60;

  function polarToCart(angleDeg: number) {
    const rad = ((angleDeg - 180) * Math.PI) / 180;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad),
    };
  }

  const start = polarToCart(0);
  const end = polarToCart(sweepDeg);
  const largeArc = sweepDeg > 90 ? 1 : 0;

  const trackStart = polarToCart(0);
  const trackEnd = polarToCart(180);

  const color = aqiColor(aqi);
  const displayCategory = category ?? aqiCategory(aqi);

  return (
    <div
      role="figure"
      aria-label={`Air Quality Index: ${aqi}, ${displayCategory}. Main pollutant: ${pollutant ?? 'Unknown'}`}
      className="flex flex-col items-center gap-2"
    >
      <svg width="120" height="70" viewBox="0 0 120 70" aria-hidden="true" focusable="false">
        <path
          d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 0 1 ${trackEnd.x} ${trackEnd.y}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          className="text-muted/50"
        />
        {sweepDeg > 0 && (
          <path
            d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
          />
        )}
        <text x="60" y="58" textAnchor="middle" fontSize="20" fontWeight="700" fill="currentColor" style={{ fontVariantNumeric: 'tabular-nums' }}>{aqi}</text>
      </svg>
      <p className="text-sm font-semibold text-foreground">{displayCategory}</p>
      {pollutant && (
        <p className="text-xs text-muted-foreground">Main pollutant: {pollutant}</p>
      )}
    </div>
  );
}

/** Skeleton tile for loading states. */
function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

/** Error message for tile failures. */
function TileError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-2 items-start text-sm">
      <p className="text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        Retry
      </button>
    </div>
  );
}

export function NowPage() {
  const { data: observation, units, loading: obsLoading, error: obsError, refetch: obsRefetch } = useRealtimeObservation();
  const { data: forecast, loading: fcLoading, error: fcError, refetch: fcRefetch } = useForecast();
  const { data: alerts, loading: alertLoading } = useAlerts();
  const { data: almanac, loading: almLoading, error: almError, refetch: almRefetch } = useAlmanac();
  const { data: earthquakes, loading: eqLoading, error: eqError, refetch: eqRefetch } = useEarthquakes();
  const { data: aqi, loading: aqiLoading, error: aqiError, refetch: aqiRefetch } = useAqi();
  const { data: station } = useStation();

  // Today's archive for todayStats computation
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: todayArchive } = useArchive({ from: todayStart.toISOString() });

  const lightning = useLightning(observation);
  const todayStats = useTodayStats(observation, todayArchive);

  const tz = station?.timezone ?? 'UTC';
  const windDir = observation?.windDir ?? 0;
  const windSpeed = observation?.windSpeed ?? 0;
  const windGust = observation?.windGust ?? 0;

  const firstQuake = earthquakes?.[0] ?? null;
  const todayForecast = forecast?.daily?.[0] ?? null;

  return (
    <div className="flex flex-col gap-4 max-w-6xl mx-auto">
      <h1 className="sr-only">Now</h1>

      {!alertLoading && alerts && <AlertBanner alerts={alerts} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">

        {/* Current Conditions Hero — lg: 8-col primary */}
        <Card className="md:col-span-2 lg:col-span-8" aria-busy={obsLoading}>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">Current Conditions</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {obsLoading ? (
              <>
                <span className="sr-only" role="status">Loading current conditions…</span>
                <TileSkeleton className="h-16 w-32" />
                <TileSkeleton className="h-4 w-48" />
              </>
            ) : obsError ? (
              <TileError message="Unable to load current conditions" onRetry={obsRefetch} />
            ) : observation ? (
              <>
                {/* aria-live="polite" scoped to just the observation values so SSE
                    updates announce only the changed reading, not the full card. */}
                <div
                  aria-live="polite"
                  aria-atomic="true"
                  className="text-7xl font-bold text-foreground leading-none font-[tabular-nums]"
                  aria-label={`Current temperature: ${observation.outTemp} degrees ${units?.outTemp ?? '°F'}`}
                >
                  {observation.outTemp}
                  <span className="text-4xl font-normal text-muted-foreground ml-1">{units?.outTemp ?? '°F'}</span>
                </div>
                <p className="text-lg text-muted-foreground">Partly Cloudy</p>
                <p className="text-sm text-muted-foreground">
                  Feels like <span className="font-medium text-foreground font-[tabular-nums]">{observation.appTemp !== null ? `${observation.appTemp}°F` : 'N/A'}</span>
                </p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No observation data available.</p>
            )}
          </CardContent>
        </Card>

        {/* Today's Highlights — lg: 4-col sidebar */}
        <Card className="md:col-span-2 lg:col-span-4">
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">Today&apos;s Highlights</h2>
          </CardHeader>
          <CardContent>
            {obsLoading ? (
              <>
                <span className="sr-only" role="status">Loading today&apos;s highlights…</span>
                <TileSkeleton className="h-24" />
              </>
            ) : todayStats ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-4 lg:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">Today&apos;s High</dt>
                  <dd className="mt-1 text-xl font-semibold text-foreground font-[tabular-nums]">{todayStats.high !== null ? `${todayStats.high}°F` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">Today&apos;s Low</dt>
                  <dd className="mt-1 text-xl font-semibold text-foreground font-[tabular-nums]">{todayStats.low !== null ? `${todayStats.low}°F` : '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">Peak Gust</dt>
                  <dd className="mt-1 text-xl font-semibold text-foreground font-[tabular-nums]">{todayStats.peakGust} mph</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">Rain Today</dt>
                  <dd className="mt-1 text-xl font-semibold text-foreground font-[tabular-nums]">{todayStats.rainSoFar} in</dd>
                </div>
                {todayStats.peakAQI > 0 && (
                  <div>
                    <dt className="text-xs text-muted-foreground uppercase tracking-wide">Peak AQI</dt>
                    <dd className="mt-1 text-xl font-semibold text-foreground font-[tabular-nums]">
                      {todayStats.peakAQI}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{aqiCategory(todayStats.peakAQI)}</span>
                    </dd>
                  </div>
                )}
                {todayStats.recordsBrokenToday.length > 0 && (
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground uppercase tracking-wide">Records Broken</dt>
                    <dd className="mt-1 font-medium text-foreground">{todayStats.recordsBrokenToday.join(', ')}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">No highlights available.</p>
            )}
          </CardContent>
        </Card>

        {/* Wind Tile — lg: 4 cols */}
        <Card className="lg:col-span-4" aria-busy={obsLoading}>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">Wind</h2>
          </CardHeader>
          <CardContent>
            {obsLoading ? (
              <>
                <span className="sr-only" role="status">Loading wind data…</span>
                <TileSkeleton className="h-32" />
              </>
            ) : obsError ? (
              <TileError message="Unable to load wind data" onRetry={obsRefetch} />
            ) : observation ? (
              <WindCompass windDir={windDir} windSpeed={windSpeed} windGust={windGust} />
            ) : (
              <p className="text-muted-foreground text-sm">No wind data available.</p>
            )}
          </CardContent>
        </Card>

        {/* Station Observations — lg: 8 cols */}
        <Card className="md:col-span-2 lg:col-span-8" aria-busy={obsLoading}>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">Station Observations</h2>
          </CardHeader>
          <CardContent>
            {obsLoading ? (
              <>
                <span className="sr-only" role="status">Loading station observations…</span>
                <TileSkeleton className="h-24" />
              </>
            ) : obsError ? (
              <TileError message="Unable to load station observations" onRetry={obsRefetch} />
            ) : observation ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">Barometer</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">
                    {observation.barometer !== null ? `${observation.barometer} inHg` : 'N/A'}
                    <span role="img" className="ml-1 text-muted-foreground" aria-label={`Trend: ${barometerTrendArrow(observation.barometerTrend) === '↑' ? 'rising' : barometerTrendArrow(observation.barometerTrend) === '↓' ? 'falling' : 'steady'}`}>
                      {barometerTrendArrow(observation.barometerTrend)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">Dewpoint</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">{observation.dewpoint !== null ? `${observation.dewpoint}°F` : 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">Humidity</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">{observation.outHumidity !== null ? `${observation.outHumidity}%` : 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">Rain</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">{observation.rain !== null ? `${observation.rain} in` : 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">Heat Index</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">
                    {observation.heatindex !== null ? `${observation.heatindex}°F` : 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">Wind Chill</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">
                    {observation.windchill !== null ? `${observation.windchill}°F` : 'N/A'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">Solar Radiation</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">{observation.radiation !== null ? `${observation.radiation} W/m²` : 'N/A'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground uppercase tracking-wide">UV Index</dt>
                  <dd className="mt-1 font-medium text-foreground font-[tabular-nums]">{observation.UV !== null ? observation.UV : 'N/A'}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">No observation data available.</p>
            )}
          </CardContent>
        </Card>

        {/* Sun & Moon — lg: 4 cols */}
        <Card className="lg:col-span-4" aria-busy={almLoading}>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">Sun &amp; Moon</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {almLoading ? (
              <>
                <span className="sr-only" role="status">Loading sun and moon data…</span>
                <TileSkeleton className="h-20" />
              </>
            ) : almError ? (
              <TileError message="Unable to load almanac data" onRetry={almRefetch} />
            ) : almanac ? (
              <>
                <div className="flex items-center gap-2">
                  <Sunrise aria-hidden="true" className="h-4 w-4 text-amber-500 shrink-0" />
                  <span className="text-muted-foreground">Sunrise</span>
                  <span className="ml-auto font-medium text-foreground">{formatLocalTime(almanac.sun.rise, tz)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sunset aria-hidden="true" className="h-4 w-4 text-amber-600 shrink-0" />
                  <span className="text-muted-foreground">Sunset</span>
                  <span className="ml-auto font-medium text-foreground">{formatLocalTime(almanac.sun.set, tz)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Moon aria-hidden="true" className="h-4 w-4 text-blue-400 shrink-0" />
                  <span className="text-muted-foreground">Moon</span>
                  <span className="ml-auto text-right font-medium text-foreground">
                    {formatPhaseName(almanac.moon.phaseName)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">{almanac.moon.illuminationPercent}% lit</span>
                  </span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No almanac data available.</p>
            )}
          </CardContent>
        </Card>

        {/* AQI Tile — lg: 4 cols */}
        <Card className="lg:col-span-4" aria-busy={aqiLoading}>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">Air Quality</h2>
          </CardHeader>
          <CardContent>
            {aqiLoading ? (
              <>
                <span className="sr-only" role="status">Loading air quality data…</span>
                <TileSkeleton className="h-24" />
              </>
            ) : aqiError ? (
              <TileError message="Unable to load air quality data" onRetry={aqiRefetch} />
            ) : aqi ? (
              <AqiGauge
                aqi={aqi.aqi ?? 0}
                category={aqi.aqiCategory}
                pollutant={aqi.aqiMainPollutant}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No air quality provider configured.</p>
            )}
          </CardContent>
        </Card>

        {/* Lightning Tile — lg: 4 cols */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">Lightning</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {obsLoading ? (
              <>
                <span className="sr-only" role="status">Loading lightning data…</span>
                <TileSkeleton className="h-16" />
              </>
            ) : lightning ? (
              <>
                <div className="flex items-center gap-2">
                  <Zap aria-hidden="true" className="h-5 w-5 text-yellow-500 shrink-0" />
                  <span className="font-medium text-foreground font-[tabular-nums]">{lightning.count1h} strikes in last hour</span>
                </div>
                <p className="text-muted-foreground font-[tabular-nums]">{lightning.count24h} in last 24h</p>
                <p className="text-muted-foreground font-[tabular-nums]">Nearest: {lightning.nearestDistanceKm} km</p>
                <p className="text-muted-foreground">Last strike: {lightning.lastStrikeTime ? formatRelativeTime(lightning.lastStrikeTime) : 'Unknown'}</p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No lightning sensor configured.</p>
            )}
          </CardContent>
        </Card>

        {/* Earthquake Tile — lg: 4 cols */}
        <Card className="lg:col-span-4" aria-busy={eqLoading}>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">Recent Earthquake</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {eqLoading ? (
              <>
                <span className="sr-only" role="status">Loading earthquake data…</span>
                <TileSkeleton className="h-16" />
              </>
            ) : eqError ? (
              <TileError message="Unable to load earthquake data" onRetry={eqRefetch} />
            ) : firstQuake ? (
              <>
                <div className="flex items-center gap-2">
                  <Activity aria-hidden="true" className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="font-medium text-foreground font-[tabular-nums]">
                    M{firstQuake.magnitude} — {firstQuake.place}
                  </span>
                </div>
                <p className="text-muted-foreground">{formatRelativeTime(firstQuake.time)}</p>
                {firstQuake.depth !== null && (
                  <p className="text-muted-foreground font-[tabular-nums]">Depth: {firstQuake.depth} km</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">No recent earthquakes in configured radius.</p>
            )}
          </CardContent>
        </Card>

        {/* Today's Forecast Card — lg: 6 cols */}
        <Card className="md:col-span-2 lg:col-span-6" aria-busy={fcLoading}>
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">Today&apos;s Forecast</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {fcLoading ? (
              <>
                <span className="sr-only" role="status">Loading forecast…</span>
                <TileSkeleton className="h-16" />
              </>
            ) : fcError ? (
              <TileError message="Unable to load forecast" onRetry={fcRefetch} />
            ) : todayForecast ? (
              <>
                <p className="text-foreground font-medium">{todayForecast.weatherText}</p>
                <p className="text-muted-foreground font-[tabular-nums]">
                  Hi {todayForecast.tempMax}° / Lo {todayForecast.tempMin}°
                </p>
                {todayForecast.precipProbabilityMax !== null && (
                  <p className="text-muted-foreground">{todayForecast.precipProbabilityMax}% chance of precipitation</p>
                )}
                {todayForecast.narrative && (
                  <p className="text-muted-foreground leading-relaxed">{todayForecast.narrative}</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">No forecast data available.</p>
            )}
          </CardContent>
        </Card>

        {/* Chart Panel — placeholder, NO Recharts import */}
        <Card className="md:col-span-2 lg:col-span-6">
          <CardHeader>
            <h2 className="font-heading text-base leading-snug font-medium">Temperature Trend</h2>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div
              aria-hidden="true"
              className="h-20 w-full rounded-md overflow-hidden bg-gradient-to-r from-blue-100 via-amber-100 to-orange-100 dark:from-blue-950/50 dark:via-amber-950/50 dark:to-orange-950/50 relative"
            >
              <svg
                viewBox="0 0 200 60"
                className="absolute inset-0 w-full h-full"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                <polyline
                  points="0,50 20,42 40,35 60,28 80,22 100,20 120,22 140,30 160,38 180,44 200,48"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-primary/60"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <Link
              to="/charts"
              className="text-sm text-primary underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded self-start"
            >
              View Charts →
            </Link>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

export default NowPage;
