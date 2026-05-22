// not-found.tsx — 404 catch-all route

import { useTranslation } from 'react-i18next';

export function NotFoundPage() {
  const { t } = useTranslation('common');

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
      <h1 className="text-4xl font-bold text-foreground">404</h1>
      <p className="text-muted-foreground">{t('pageNotFound')}</p>
    </div>
  );
}

export default NotFoundPage;
