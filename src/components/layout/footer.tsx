import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStation } from '../../hooks/useWeatherData';

export function Footer() {
  const { data: station } = useStation();
  const { t } = useTranslation('common');

  return (
    <footer className={[
      'mt-auto border-t border-border px-4 py-3 text-sm text-muted-foreground',
      // On mobile the bottom nav bar is fixed at 56px. Without bottom padding the footer
      // renders beneath it and is invisible. md:pb-0 restores normal flow on desktop.
      'pb-[calc(56px+12px)] md:pb-3',
    ].join(' ')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link
          to="/legal"
          className="hover:text-foreground underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
        >
          {t('footer.legal')}
        </Link>
        <span aria-hidden="true">·</span>
        <span>© {new Date().getFullYear()} {station?.name ?? 'Clear Skies Weather'}</span>
        <span aria-hidden="true">·</span>
        <span>{t('footer.poweredBy')}</span>
      </div>
    </footer>
  );
}
