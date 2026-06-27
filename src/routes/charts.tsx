import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartLine } from '@phosphor-icons/react';
import { useChartsConfig, useStation } from '../hooks/useWeatherData';
import { ConfigDrivenGroup } from '../components/charts/ConfigDrivenGroup';
import { PageLayout } from '../components/layout/page-layout';

// ---------------------------------------------------------------------------
// usePrefersReducedMotion — local hook, passed down to ConfigDrivenGroup
// ---------------------------------------------------------------------------

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}

// ---------------------------------------------------------------------------
// ChartsPage
// ---------------------------------------------------------------------------

export function ChartsPage() {
  const { t } = useTranslation('charts');
  const reducedMotion = usePrefersReducedMotion();

  // Fetch charts config
  const { data: chartsConfig, loading: configLoading, error: configError } = useChartsConfig();

  // Fetch station for firstRecord year and timezone
  const { data: station } = useStation();
  const stationFirstYear = station?.firstRecord
    ? new Date(station.firstRecord).getFullYear()
    : undefined;
  const stationTz = station?.timezone;

  // Filter to groups that should show as tabs
  const groups = chartsConfig?.groups?.filter((g) => g.showButton) ?? [];

  // Active tab state
  const [activeTab, setActiveTab] = useState<string>('');

  // Set initial tab when groups load
  useEffect(() => {
    if (groups.length > 0 && !groups.some((g) => g.groupId === activeTab)) {
      setActiveTab(groups[0].groupId);
    }
  }, [groups, activeTab]);

  // Tab refs for keyboard focus management
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabScrollRef = useRef<HTMLDivElement | null>(null);

  // Detect whether the tab row overflows so we can show a fade indicator
  const [tabsCanScrollRight, setTabsCanScrollRight] = useState(false);

  useLayoutEffect(() => {
    const el = tabScrollRef.current;
    if (!el) return;

    function checkOverflow() {
      if (!el) return;
      setTabsCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }

    checkOverflow();
    el.addEventListener('scroll', checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkOverflow);
      ro.disconnect();
    };
  }, []);

  // Keyboard navigation — WAI-ARIA tab pattern with dynamic group length
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number | null = null;
      if (e.key === 'ArrowRight') nextIndex = (index + 1) % groups.length;
      else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + groups.length) % groups.length;
      else if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = groups.length - 1;

      if (nextIndex !== null) {
        e.preventDefault();
        setActiveTab(groups[nextIndex].groupId);
        tabRefs.current[nextIndex]?.focus();
      }
    },
    [groups],
  );

  // Loading state
  if (configLoading) {
    return (
      <PageLayout title={t('title')} icon={<ChartLine weight="duotone" />}>
        <span className="sr-only" role="status">
          {t('loadingChart')}
        </span>
        <div className="col-span-1 md:col-span-2 lg:col-span-4 animate-pulse rounded-xl bg-muted h-[400px]" aria-hidden="true" />
      </PageLayout>
    );
  }

  if (configError) {
    return (
      <PageLayout title={t('title')} icon={<ChartLine weight="duotone" />}>
        <div role="alert" className="col-span-1 md:col-span-2 lg:col-span-4 text-destructive py-8 text-center" style={{ fontSize: 'var(--text-body)' }}>
          {t('unableToLoad')}
        </div>
      </PageLayout>
    );
  }

  if (groups.length === 0) {
    return (
      <PageLayout title={t('title')} icon={<ChartLine weight="duotone" />}>
        <p className="col-span-1 md:col-span-2 lg:col-span-4 text-muted-foreground py-8 text-center" style={{ fontSize: 'var(--text-body)' }}>
          {t('noData')}
        </p>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={t('title')}
      icon={<ChartLine weight="duotone" />}
      controls={
        <>
          {/* Mobile: dropdown selector — avoids truncated button labels */}
          <div className="block w-full md:hidden">
            <label htmlFor="chart-group-select" className="sr-only">
              {t('ariaTabGroupLabel')}
            </label>
            <select
              id="chart-group-select"
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 py-2 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              style={{ fontSize: 'var(--text-label)' }}
            >
              {groups.map((group) => (
                <option key={group.groupId} value={group.groupId}>
                  {group.buttonText ?? group.title ?? group.groupId}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop: tab button bar */}
          <div className="relative hidden md:flex md:flex-1 md:min-w-0">
            <div
              ref={tabScrollRef}
              role="tablist"
              aria-label={t('ariaTabGroupLabel')}
              className="flex gap-1 overflow-x-auto pb-1 flex-1"
            >
              {groups.map((group, index) => (
                <button
                  key={group.groupId}
                  ref={(el) => { tabRefs.current[index] = el; }}
                  role="tab"
                  id={`tab-${group.groupId}`}
                  aria-selected={activeTab === group.groupId}
                  aria-controls={`panel-${group.groupId}`}
                  tabIndex={activeTab === group.groupId ? 0 : -1}
                  type="button"
                  onClick={() => setActiveTab(group.groupId)}
                  onKeyDown={(e) => handleTabKeyDown(e, index)}
                  style={{ fontSize: 'var(--text-label)' }}
                  className={[
                    'shrink-0 rounded-md px-3 py-1.5 font-semibold transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    activeTab === group.groupId
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground hover:bg-muted/70',
                  ].join(' ')}
                >
                  {group.buttonText ?? group.title ?? group.groupId}
                </button>
              ))}
            </div>
            {tabsCanScrollRight && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent"
              />
            )}
          </div>
        </>
      }
    >
      {/* ── Tab panels ───────────────────────────────────────────────────── */}
        {groups.map((group) => (
          <div
            key={group.groupId}
            role="tabpanel"
            id={`panel-${group.groupId}`}
            aria-labelledby={`tab-${group.groupId}`}
            hidden={activeTab !== group.groupId}
            className="col-span-1 md:col-span-2 lg:col-span-4"
          >
            {activeTab === group.groupId && (
              <ConfigDrivenGroup
                group={group}
                globalColors={chartsConfig?.colors}
                globalType={chartsConfig?.type}
                reducedMotion={reducedMotion}
                stationFirstYear={stationFirstYear}
                archiveIntervalSeconds={station?.archiveIntervalSeconds}
                weekStartDay={station?.weekStartDay}
                stationTz={stationTz}
              />
            )}
          </div>
        ))}
    </PageLayout>
  );
}

export default ChartsPage;
