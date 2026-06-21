import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from './ui/card';
import { HeaderTabs } from './ui/header-controls';
import type { WebcamConfig } from '../api/types';
import type { CardComponentProps } from '../lib/card-registry';

export interface WebcamCardProps {
  webcamConfig: WebcamConfig;
  refreshTs: number;
  videoRefreshTs: number;
}

function WebcamCardContent({ webcamConfig, refreshTs, videoRefreshTs }: WebcamCardProps) {
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
    <Card footprint="wide" rowSpan={2.5}>
      <CardHeader>
        <CardTitle as="h2">{t('webcam')}</CardTitle>
        <HeaderTabs
          tabs={[
            { id: 'live', label: t('webcamTabLive') },
            { id: 'timelapse', label: t('webcamTabTimelapse') },
          ]}
          activeTab={webcamTab}
          onTabChange={(id) => setWebcamTab(id as 'live' | 'timelapse')}
          ariaLabel={t('webcam')}
        />
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
              <div className="w-full h-full flex items-center justify-center text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>
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
            <p className="text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>{t('noData.timelapse')}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// DataBag-aware component (CardComponentProps — T0B.2 contract)
// ---------------------------------------------------------------------------

export function WebcamCard(props: CardComponentProps): React.ReactElement;
export function WebcamCard(props: WebcamCardProps): React.ReactElement;
export function WebcamCard(props: CardComponentProps | WebcamCardProps): React.ReactElement {
  if ('dataBag' in props) {
    // DataBag path — self-extract from dataBag['webcam']
    const webcamData = props.dataBag['webcam'] as {
      config?: WebcamConfig | null;
      refreshTs?: number;
      videoRefreshTs?: number;
    } | undefined;

    const config = webcamData?.config;

    // If webcam is not configured in the DataBag, render nothing (card not enabled)
    if (!config) return <></>;

    return (
      <WebcamCardContent
        webcamConfig={config}
        refreshTs={webcamData?.refreshTs ?? 0}
        videoRefreshTs={webcamData?.videoRefreshTs ?? 0}
      />
    );
  }
  // Legacy path — explicit props
  return (
    <WebcamCardContent
      webcamConfig={props.webcamConfig}
      refreshTs={props.refreshTs}
      videoRefreshTs={props.videoRefreshTs}
    />
  );
}

export default WebcamCard;
