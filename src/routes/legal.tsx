// legal.tsx — Legal page (/legal)

import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { useContent } from '../hooks/useWeatherData';

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

export function LegalPage() {
  const { t } = useTranslation('legal');
  const { data: content, loading } = useContent('legal');

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>

      {/* Operator-authored legal content — shown if configured, else show default text */}
      {loading ? (
        <>
          <span className="sr-only" role="status">{t('loadingAria')}</span>
          <TileSkeleton className="h-32" />
        </>
      ) : content ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t('operatorCard.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {content.markdown}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t('privacy.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('privacy.body')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">{t('attribution.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1.5">
                <li>{t('attribution.observations')}</li>
                <li>{t('attribution.forecast')}</li>
                <li>{t('attribution.airQuality')}</li>
                <li>{t('attribution.earthquake')}</li>
                <li>{t('attribution.astronomical')}</li>
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                {t('attribution.note')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">{t('openSource.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t('openSource.body')}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default LegalPage;
