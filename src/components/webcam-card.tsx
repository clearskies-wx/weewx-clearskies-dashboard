import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from './ui/card';
import type { WebcamConfig } from '../api/types';

export interface WebcamCardProps {
  webcamConfig: WebcamConfig;
  refreshTs: number;
  videoRefreshTs: number;
}

export function WebcamCard({ webcamConfig, refreshTs, videoRefreshTs }: WebcamCardProps) {
  const { t } = useTranslation('now');
  const [webcamTab, setWebcamTab] = useState<'live' | 'timelapse'>('live');
  const [imageAvailable, setImageAvailable] = useState(true);
  const [videoAvailable, setVideoAvailable] = useState(true);

  // Reset imageAvailable on each refresh cycle so the card retries loading
  // the webcam image even after a prior failure. The card always stays mounted
  // when enabled in wizard config — never hidden due to a transient error.
  useEffect(() => {
    setImageAvailable(true);
  }, [refreshTs]);

  return (
    <Card footprint="wide" rowSpan={2}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle as="h2">{t('webcam')}</CardTitle>
        <div className="flex gap-1" role="tablist" aria-label={t('webcam')}>
          <button
            type="button"
            role="tab"
            aria-selected={webcamTab === 'live'}
            onClick={() => setWebcamTab('live')}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{
              fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
              fontSize: '0.72rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '999px',
              padding: '0.16rem 0.55rem',
              cursor: 'pointer',
              lineHeight: 1.4,
              background: webcamTab === 'live' ? 'var(--primary)' : 'rgba(0,0,0,0.07)',
              color: webcamTab === 'live' ? 'var(--primary-foreground, #fff)' : 'var(--muted-foreground)',
            }}
          >
            {t('webcamTabLive')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={webcamTab === 'timelapse'}
            onClick={() => setWebcamTab('timelapse')}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{
              fontFamily: 'var(--font-sans, Manrope, system-ui, sans-serif)',
              fontSize: '0.72rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '999px',
              padding: '0.16rem 0.55rem',
              cursor: 'pointer',
              lineHeight: 1.4,
              background: webcamTab === 'timelapse' ? 'var(--primary)' : 'rgba(0,0,0,0.07)',
              color: webcamTab === 'timelapse' ? 'var(--primary-foreground, #fff)' : 'var(--muted-foreground)',
            }}
          >
            {t('webcamTabTimelapse')}
          </button>
        </div>
      </CardHeader>
      {/* CardContent is always flex-col (card.tsx base class) — media fills available height. */}
      <CardContent>
        {/* Media wrapper — flex-grow so it fills CardContent; overflow:hidden clips
            any residual pixel from the image's natural aspect ratio. */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: '0.375rem' }}>
          {webcamTab === 'live' ? (
            imageAvailable ? (
              <img
                src={`${webcamConfig.imageUrl}?t=${refreshTs}`}
                alt={t('webcamAlt')}
                className="w-full h-full rounded object-contain"
                onError={() => setImageAvailable(false)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                {t('noData.webcam', 'Webcam image unavailable')}
              </div>
            )
          ) : videoAvailable ? (
            <video
              controls
              loop
              className="w-full h-full rounded object-contain"
              onError={() => setVideoAvailable(false)}
            >
              <source src={`${webcamConfig.videoUrl}?t=${videoRefreshTs}`} type="video/mp4" />
            </video>
          ) : (
            <p className="text-muted-foreground text-sm">{t('noData.timelapse')}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
