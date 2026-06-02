import { useState } from 'react';
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

  if (!imageAvailable) return null;

  return (
    <Card footprint="wide" rowSpan={2}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle as="h2">{t('webcam')}</CardTitle>
        <div className="flex gap-1" role="tablist" aria-label={t('webcam')}>
          <button
            type="button"
            role="tab"
            className={`px-2 py-1 text-xs rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${webcamTab === 'live' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            onClick={() => setWebcamTab('live')}
            aria-selected={webcamTab === 'live'}
          >
            {t('webcamTabLive')}
          </button>
          <button
            type="button"
            role="tab"
            className={`px-2 py-1 text-xs rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${webcamTab === 'timelapse' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            onClick={() => setWebcamTab('timelapse')}
            aria-selected={webcamTab === 'timelapse'}
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
            <img
              src={`${webcamConfig.imageUrl}?t=${refreshTs}`}
              alt={t('webcamAlt')}
              className="w-full h-full rounded object-cover"
              onError={() => setImageAvailable(false)}
            />
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
