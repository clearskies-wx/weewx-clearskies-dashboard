// radar.tsx — Full-viewport expanded radar route (/radar).
//
// Opened by the expand button on the radar card. Renders RadarMap
// full-screen as an overlay (no nav rail, no app header).
// Pressing Escape or clicking the close button navigates back.
//
// Station metadata is fetched here directly via useStation so this route
// works independently of the Now page's DataBag.

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';
import { RadarMap } from '../components/shared/radar-map';
import { useStation } from '../hooks/useWeatherData';

export default function RadarPage() {
  const { t } = useTranslation('radar');
  const navigate = useNavigate();

  const { data: station, loading: stationLoading } = useStation();

  // Keyboard shortcut: Escape closes the expanded view.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        navigate(-1);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0">
        <h1 className="text-lg font-semibold">{t('radarTitle')}</h1>
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('closeRadar')}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 min-h-0 p-3">
        {stationLoading || station === null ? (
          <div
            className="h-full rounded-lg bg-muted animate-pulse"
            aria-hidden="true"
          />
        ) : (
          <RadarMap
            center={[station.latitude, station.longitude]}
            stationTz={station.timezone}
            zoom={7}
          />
        )}
      </div>
    </div>
  );
}
