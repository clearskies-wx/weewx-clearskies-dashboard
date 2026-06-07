import { useState, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartLine } from '@phosphor-icons/react';
import { useChartsConfig, useStation } from '../hooks/useWeatherData';
import { ConfigDrivenGroup } from '../components/charts/ConfigDrivenGroup';
import { Grid } from '../components/layout/grid';
import { Card } from '../components/ui/card';
import { PageHeaderCard } from '../components/layout/page-header-card';

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
  const { t, i18n } = useTranslation('charts');
  const reducedMotion = usePrefersReducedMotion();

  // Fetch charts config
  const { data: chartsConfig, loading: configLoading, error: configError } = useChartsConfig();

  // Fetch station for firstRecord year
  const { data: station } = useStation();
  const stationFirstYear = station?.firstRecord
    ? new Date(station.firstRecord).getFullYear()
    : undefined;

  // Filter to groups that should show as tabs
  const groups = chartsConfig?.groups?.filter((g) => g.showButton) ?? [];

  // Active tab state
  const [activeTab, setActiveTab] = useState<string>('');

  // Lifted date control state — owned here, passed to ConfigDrivenGroup
  const [selectedRange, setSelectedRange] = useState('1d');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  // Set initial tab when groups load
  useEffect(() => {
    if (groups.length > 0 && !groups.some((g) => g.groupId === activeTab)) {
      setActiveTab(groups[0].groupId);
      setSelectedRange(groups[0].rollingRanges?.[0] ?? '1d');
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
        const nextGroup = groups[nextIndex];
        setActiveTab(nextGroup.groupId);
        // Reset date state for the newly-focused tab
        setSelectedRange(nextGroup.rollingRanges?.[0] ?? '1d');
        setSelectedYear(new Date().getFullYear());
        setSelectedMonth(null);
        tabRefs.current[nextIndex]?.focus();
      }
    },
    [groups],
  );

  // Active group — derived from current tab
  const activeGroup = groups.find((g) => g.groupId === activeTab);

  // Date control mode for active group
  const showRollingRanges =
    activeGroup != null &&
    activeGroup.enableDateRanges &&
    activeGroup.rollingRanges.length > 0;

  const showYearMonthDropdowns =
    activeGroup != null &&
    !showRollingRanges &&
    (activeGroup.availableYears.length > 0 || stationFirstYear != null);

  // Build year list for dropdowns
  const yearList: number[] = (() => {
    if (!activeGroup) return [];
    if (activeGroup.availableYears.length > 0) return activeGroup.availableYears;
    const currentYear = new Date().getFullYear();
    const firstYear = stationFirstYear ?? currentYear;
    const years: number[] = [];
    for (let y = currentYear; y >= firstYear; y--) years.push(y);
    return years;
  })();

  // Loading state
  if (configLoading) {
    return (
      <div className="flex flex-col gap-4">
        <span className="sr-only" role="status">
          {t('loadingChart')}
        </span>
        <Grid className="md:auto-rows-[auto]">
          <div className="col-span-1 md:col-span-2 lg:col-span-4 animate-pulse rounded-xl bg-muted h-14" aria-hidden="true" />
          <div className="col-span-1 md:col-span-2 lg:col-span-4 animate-pulse rounded-xl bg-muted h-[400px]" aria-hidden="true" />
        </Grid>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="flex flex-col gap-4">
        <Grid className="md:auto-rows-[auto]">
          <PageHeaderCard title={t('title')} icon={<ChartLine weight="duotone" />} />
          <div role="alert" className="col-span-1 md:col-span-2 lg:col-span-4 text-sm text-destructive py-8 text-center">
            {t('unableToLoad')}
          </div>
        </Grid>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Grid className="md:auto-rows-[auto]">
          <PageHeaderCard title={t('title')} icon={<ChartLine weight="duotone" />} />
          <p className="col-span-1 md:col-span-2 lg:col-span-4 text-muted-foreground text-sm py-8 text-center">
            {t('noData')}
          </p>
        </Grid>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Grid className="md:auto-rows-[auto]">
        {/* ── Page header ──────────────────────────────────────────────────── */}
        <PageHeaderCard title={t('title')} icon={<ChartLine weight="duotone" />} />

        {/* ── Combined tab nav + date controls card ────────────────────────── */}
        <Card footprint="full" className="py-2 px-4">
          <div className="flex items-center justify-between gap-4">
            {/* LEFT: WAI-ARIA tablist */}
            <div className="relative min-w-0 flex-1">
              <div
                ref={tabScrollRef}
                role="tablist"
                aria-label={t('ariaTabGroupLabel')}
                className="flex gap-1 overflow-x-auto pb-1"
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
                    onClick={() => {
                      setActiveTab(group.groupId);
                      // Reset date state when switching tabs
                      setSelectedRange(group.rollingRanges?.[0] ?? '1d');
                      setSelectedYear(new Date().getFullYear());
                      setSelectedMonth(null);
                    }}
                    onKeyDown={(e) => handleTabKeyDown(e, index)}
                    className={[
                      'shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      'min-h-[44px] md:min-h-0',
                      activeTab === group.groupId
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground hover:bg-muted/70',
                    ].join(' ')}
                  >
                    {group.buttonText ?? group.title ?? group.groupId}
                  </button>
                ))}
              </div>
              {/* Scroll fade indicator — visible only when content overflows right */}
              {tabsCanScrollRight && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent"
                />
              )}
            </div>

            {/* RIGHT: date controls for the active group */}
            {showRollingRanges && activeGroup && (
              <div
                role="radiogroup"
                aria-label={t('ariaRangeGroupLabel')}
                className="flex flex-shrink-0 flex-wrap gap-2"
                onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                  const ranges = activeGroup.rollingRanges;
                  const currentIdx = ranges.indexOf(selectedRange);
                  let nextIdx = currentIdx;
                  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    nextIdx = (currentIdx + 1) % ranges.length;
                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    nextIdx = (currentIdx - 1 + ranges.length) % ranges.length;
                  } else {
                    return;
                  }
                  setSelectedRange(ranges[nextIdx]);
                  const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]');
                  buttons[nextIdx]?.focus();
                }}
              >
                {activeGroup.rollingRanges.map((range) => {
                  const isSelected = range === selectedRange;
                  return (
                    <button
                      key={range}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={isSelected ? 0 : -1}
                      onClick={() => setSelectedRange(range)}
                      className={[
                        'min-h-[44px] md:min-h-0 px-3 py-1.5 rounded-md border text-sm',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-border hover:bg-muted/50',
                      ].join(' ')}
                    >
                      {t(`ranges.${range}`, { defaultValue: range })}
                    </button>
                  );
                })}
              </div>
            )}

            {showYearMonthDropdowns && activeGroup && (
              <div className="flex flex-shrink-0 flex-wrap gap-4">
                {/* Year selector */}
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`charts-year-select-${activeTab}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    {t('monthlyYearLabel')}
                  </label>
                  <select
                    id={`charts-year-select-${activeTab}`}
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="min-h-[44px] md:min-h-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {yearList.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                {/* Optional month selector */}
                {activeGroup.enableMonthlyBreakdown && (
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`charts-month-select-${activeTab}`}
                      className="text-xs font-medium text-muted-foreground"
                    >
                      {t('monthlyMonthLabel')}
                    </label>
                    <select
                      id={`charts-month-select-${activeTab}`}
                      value={selectedMonth ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedMonth(val === '' ? null : Number(val));
                      }}
                      className="min-h-[44px] md:min-h-0 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">{t('allMonths')}</option>
                      {Array.from({ length: 12 }, (_, i) => {
                        const label = new Intl.DateTimeFormat(i18n.language, { month: 'long' }).format(new Date(2000, i));
                        return (
                          <option key={i + 1} value={i + 1}>{label}</option>
                        );
                      })}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

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
                hideControls={true}
                selectedRange={selectedRange}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
              />
            )}
          </div>
        ))}
      </Grid>
    </div>
  );
}

export default ChartsPage;
