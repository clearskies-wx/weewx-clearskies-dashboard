import { useTranslation } from 'react-i18next';
import { CloudSun } from '@phosphor-icons/react';
import { Grid } from '../components/layout/grid';
import { PageHeaderCard } from '../components/layout/page-header-card';

export function ForecastPage() {
  const { t } = useTranslation('forecast');

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{t('title')}</h1>
      <Grid className="md:auto-rows-[auto]">
        <PageHeaderCard title={t('title')} icon={<CloudSun weight="duotone" />} />
      </Grid>
    </div>
  );
}

export default ForecastPage;
