// legal.tsx — Legal page (/legal)

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { Grid } from '../components/layout/grid';
import { PageHeaderCard } from '../components/layout/page-header-card';
import { Scales } from '@phosphor-icons/react';
import { useContent } from '../hooks/useWeatherData';
import { useBranding } from '../lib/branding-provider';

function TileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-muted ${className ?? 'h-32'}`}
      aria-hidden="true"
    />
  );
}

// JurisdictionSection implements the WAI-ARIA disclosure pattern:
// https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
//
// Each section has:
//   - A <button> with aria-expanded + aria-controls for the toggle trigger
//   - A content panel with role="region" + aria-labelledby + a stable id
//
// Heading level: the card using JurisdictionSection uses h2; these jurisdiction
// headings sit inside the disclosure button below that level. The visible heading
// is rendered as an h3 inside the button so that the document outline is correct
// (h1 page title → h2 card title → h3 jurisdiction/law heading).
interface JurisdictionSectionProps {
  id: string;
  heading: string;
  children: React.ReactNode;
}

function JurisdictionSection({ id, heading, children }: JurisdictionSectionProps) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation('legal');

  const buttonId = `jurisdiction-btn-${id}`;
  const panelId = `jurisdiction-panel-${id}`;

  return (
    <div className="border-b border-border last:border-b-0">
      {/* Toggle button — full-width, left-aligned, with chevron indicator */}
      <h3 className="m-0">
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((prev) => !prev)}
          className={[
            'flex w-full items-center justify-between gap-3 px-4 py-3',
            'text-left text-sm font-medium text-foreground',
            // Focus ring — uses the same ring tokens as the rest of the design system.
            // Must NOT use outline:none without replacement (coding rules §5.3).
            'rounded focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:border-ring',
            'hover:bg-muted/50 transition-colors',
          ].join(' ')}
        >
          <span>{heading}</span>
          {/* Chevron — decorative, state conveyed by aria-expanded on the button */}
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 20 20"
            className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              fill="currentColor"
            />
          </svg>
        </button>
      </h3>

      {/* Content panel — hidden when closed; visible region when open */}
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="px-4 pb-4 pt-1 text-sm text-muted-foreground leading-relaxed space-y-3"
      >
        {children}
        {/* Visual label for screen readers / low-vis users: re-state the section above the content */}
        <p className="sr-only">
          {t('jurisdictions.expandLabel')}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Continent filtering helpers
// ---------------------------------------------------------------------------

/**
 * filterByContinent — given a record of items each with a `continent` string
 * and a comma-separated `regions` string (e.g. "north-america,europe"),
 * returns an array of [key, value] pairs whose continent matches any of the
 * requested regions.
 *
 * "global", empty string, or undefined → return all items (safe default for
 * operators who have not yet configured privacyRegions — Phase 4).
 */
function filterByContinent<T extends { continent: string }>(
  items: Record<string, T>,
  regions: string | undefined,
): Array<[string, T]> {
  const entries = Object.entries(items);
  if (!regions || regions.trim() === '' || regions.trim() === 'global') {
    return entries;
  }
  const allowed = new Set(regions.split(',').map((r) => r.trim()).filter(Boolean));
  return entries.filter(([, item]) => allowed.has(item.continent));
}

// ---------------------------------------------------------------------------
// Jurisdiction entry shapes (typed for safe array access in TSC)
// ---------------------------------------------------------------------------

interface JurisdictionEntry {
  continent: string;
  heading: string;
  p1?: string;
  p2?: string;
  p3?: string;
  p4?: string;
  p5?: string;
  p6?: string;
  p7?: string;
  p8?: string;
  p9?: string;
  rights?: string[];
  legalBases?: string[];
}

interface AccessibilityLawEntry {
  title: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Renders the full CCPA jurisdiction block. */
function CcpaSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  const rights = t(`jurisdictions.${jKey}.rights`, { returnObjects: true }) as string[];
  return (
    <JurisdictionSection id={jKey} heading={t(`jurisdictions.${jKey}.heading`)}>
      <p>{t(`jurisdictions.${jKey}.p1`)}</p>
      <p>{t(`jurisdictions.${jKey}.p2`)}</p>
      <p>{t(`jurisdictions.${jKey}.p3`)}</p>
      <p>{t(`jurisdictions.${jKey}.p4`)}</p>
      <ul className="list-disc list-inside space-y-1 pl-2">
        {rights.map((right) => (
          <li key={right}>{right}</li>
        ))}
      </ul>
      <p>{t(`jurisdictions.${jKey}.p5`)}</p>
      <p className="text-xs text-muted-foreground">{t(`jurisdictions.${jKey}.p6`)}</p>
    </JurisdictionSection>
  );
}

/** Renders the CalOPPA jurisdiction block. */
function CaloppaSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  return (
    <JurisdictionSection id={jKey} heading={t(`jurisdictions.${jKey}.heading`)}>
      <p>{t(`jurisdictions.${jKey}.p1`)}</p>
      <p>{t(`jurisdictions.${jKey}.p2`)}</p>
      <p>{t(`jurisdictions.${jKey}.p3`)}</p>
      <p>{t(`jurisdictions.${jKey}.p4`)}</p>
      <p className="text-xs text-muted-foreground">{t(`jurisdictions.${jKey}.p5`)}</p>
    </JurisdictionSection>
  );
}

/** Renders the GDPR jurisdiction block. */
function GdprSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  const legalBases = t(`jurisdictions.${jKey}.legalBases`, { returnObjects: true }) as string[];
  const rights = t(`jurisdictions.${jKey}.rights`, { returnObjects: true }) as string[];
  return (
    <JurisdictionSection id={jKey} heading={t(`jurisdictions.${jKey}.heading`)}>
      <p>{t(`jurisdictions.${jKey}.p1`)}</p>
      <p>{t(`jurisdictions.${jKey}.p2`)}</p>
      <p>{t(`jurisdictions.${jKey}.p3`)}</p>
      <p>{t(`jurisdictions.${jKey}.p4`)}</p>
      <ul className="list-disc list-inside space-y-1 pl-2">
        {legalBases.map((basis) => (
          <li key={basis}>{basis}</li>
        ))}
      </ul>
      <p>{t(`jurisdictions.${jKey}.p5`)}</p>
      <ul className="list-disc list-inside space-y-1 pl-2">
        {rights.map((right) => (
          <li key={right}>{right}</li>
        ))}
      </ul>
      <p>{t(`jurisdictions.${jKey}.p6`)}</p>
      <p>{t(`jurisdictions.${jKey}.p7`)}</p>
      <p>{t(`jurisdictions.${jKey}.p8`)}</p>
      <p className="text-xs text-muted-foreground">{t(`jurisdictions.${jKey}.p9`)}</p>
    </JurisdictionSection>
  );
}

/** Renders the UK GDPR/PECR jurisdiction block. */
function UkGdprSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  const legalBases = t(`jurisdictions.${jKey}.legalBases`, { returnObjects: true }) as string[];
  const rights = t(`jurisdictions.${jKey}.rights`, { returnObjects: true }) as string[];
  return (
    <JurisdictionSection id={jKey} heading={t(`jurisdictions.${jKey}.heading`)}>
      <p>{t(`jurisdictions.${jKey}.p1`)}</p>
      <p>{t(`jurisdictions.${jKey}.p2`)}</p>
      <p>{t(`jurisdictions.${jKey}.p3`)}</p>
      <p>{t(`jurisdictions.${jKey}.p4`)}</p>
      <ul className="list-disc list-inside space-y-1 pl-2">
        {legalBases.map((basis) => (
          <li key={basis}>{basis}</li>
        ))}
      </ul>
      <p>{t(`jurisdictions.${jKey}.p5`)}</p>
      <ul className="list-disc list-inside space-y-1 pl-2">
        {rights.map((right) => (
          <li key={right}>{right}</li>
        ))}
      </ul>
      <p>{t(`jurisdictions.${jKey}.p6`)}</p>
      <p className="text-xs text-muted-foreground">{t(`jurisdictions.${jKey}.p7`)}</p>
    </JurisdictionSection>
  );
}

/** Renders the Quebec Law 25 jurisdiction block. */
function QuebecSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  const rights = t(`jurisdictions.${jKey}.rights`, { returnObjects: true }) as string[];
  return (
    <JurisdictionSection id={jKey} heading={t(`jurisdictions.${jKey}.heading`)}>
      <p>{t(`jurisdictions.${jKey}.p1`)}</p>
      <p>{t(`jurisdictions.${jKey}.p2`)}</p>
      <p>{t(`jurisdictions.${jKey}.p3`)}</p>
      <p>{t(`jurisdictions.${jKey}.p4`)}</p>
      <p>{t(`jurisdictions.${jKey}.p5`)}</p>
      <ul className="list-disc list-inside space-y-1 pl-2">
        {rights.map((right) => (
          <li key={right}>{right}</li>
        ))}
      </ul>
      <p>{t(`jurisdictions.${jKey}.p6`)}</p>
      <p>{t(`jurisdictions.${jKey}.p7`)}</p>
      <p>{t(`jurisdictions.${jKey}.p8`)}</p>
      <p className="text-xs text-muted-foreground">{t(`jurisdictions.${jKey}.p9`)}</p>
    </JurisdictionSection>
  );
}

/** Generic jurisdiction block for LGPD, APPI, DPDP, Australia Privacy Act, POPIA. */
function GenericJurisdictionSection({ jKey, paragraphs, hasRights }: {
  jKey: string;
  paragraphs: string[];
  hasRights?: boolean;
}) {
  const { t } = useTranslation('legal');
  const rights = hasRights
    ? (t(`jurisdictions.${jKey}.rights`, { returnObjects: true }) as string[])
    : [];

  return (
    <JurisdictionSection id={jKey} heading={t(`jurisdictions.${jKey}.heading`)}>
      {paragraphs.map((pKey, idx) => {
        // Insert rights list after the p that says "Your rights under..." (before last p)
        if (hasRights && idx === paragraphs.length - 2) {
          return (
            <>
              <p key={pKey}>{t(`jurisdictions.${jKey}.${pKey}`)}</p>
              <ul key={`${pKey}-list`} className="list-disc list-inside space-y-1 pl-2">
                {rights.map((right) => (
                  <li key={right}>{right}</li>
                ))}
              </ul>
            </>
          );
        }
        // Last paragraph gets muted styling
        if (idx === paragraphs.length - 1) {
          return (
            <p key={pKey} className="text-xs text-muted-foreground">
              {t(`jurisdictions.${jKey}.${pKey}`)}
            </p>
          );
        }
        return <p key={pKey}>{t(`jurisdictions.${jKey}.${pKey}`)}</p>;
      })}
    </JurisdictionSection>
  );
}

// ---------------------------------------------------------------------------
// Jurisdiction renderer — dispatches to the right component per key
// ---------------------------------------------------------------------------

function renderJurisdiction(key: string): React.ReactNode {
  switch (key) {
    case 'ccpa':
      return <CcpaSection key={key} jKey={key} />;
    case 'caloppa':
      return <CaloppaSection key={key} jKey={key} />;
    case 'gdpr':
      return <GdprSection key={key} jKey={key} />;
    case 'ukgdpr':
      return <UkGdprSection key={key} jKey={key} />;
    case 'quebec':
      return <QuebecSection key={key} jKey={key} />;
    case 'lgpd':
      return (
        <GenericJurisdictionSection
          key={key}
          jKey={key}
          paragraphs={['p1', 'p2', 'p3', 'p4', 'p5', 'p6']}
          hasRights
        />
      );
    case 'appi':
      return (
        <GenericJurisdictionSection
          key={key}
          jKey={key}
          paragraphs={['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']}
          hasRights
        />
      );
    case 'dpdp':
      return (
        <GenericJurisdictionSection
          key={key}
          jKey={key}
          paragraphs={['p1', 'p2', 'p3', 'p4', 'p5', 'p6']}
          hasRights
        />
      );
    case 'australiaPrivacy':
      return (
        <GenericJurisdictionSection
          key={key}
          jKey={key}
          paragraphs={['p1', 'p2', 'p3', 'p4', 'p5', 'p6']}
          hasRights
        />
      );
    case 'popia':
      return (
        <GenericJurisdictionSection
          key={key}
          jKey={key}
          paragraphs={['p1', 'p2', 'p3', 'p4', 'p5', 'p6']}
          hasRights
        />
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export function LegalPage() {
  const { t } = useTranslation('legal');
  const { data: content, loading } = useContent('legal');
  const branding = useBranding();
  const privacyRegions = branding.privacyRegions;

  // Build typed jurisdiction map for filtering.
  // Each entry must have a `continent` field — verified in legal.json.
  const allJurisdictions: Record<string, JurisdictionEntry> = {
    ccpa: { continent: 'north-america', heading: t('jurisdictions.ccpa.heading') },
    caloppa: { continent: 'north-america', heading: t('jurisdictions.caloppa.heading') },
    gdpr: { continent: 'europe', heading: t('jurisdictions.gdpr.heading') },
    ukgdpr: { continent: 'europe', heading: t('jurisdictions.ukgdpr.heading') },
    quebec: { continent: 'north-america', heading: t('jurisdictions.quebec.heading') },
    lgpd: { continent: 'south-america', heading: t('jurisdictions.lgpd.heading') },
    appi: { continent: 'asia', heading: t('jurisdictions.appi.heading') },
    dpdp: { continent: 'asia', heading: t('jurisdictions.dpdp.heading') },
    australiaPrivacy: { continent: 'oceania', heading: t('jurisdictions.australiaPrivacy.heading') },
    popia: { continent: 'africa', heading: t('jurisdictions.popia.heading') },
  };

  const filteredJurisdictions = filterByContinent(allJurisdictions, privacyRegions);

  // Accessibility laws map for filtering
  const allAccessibilityLaws: Record<string, AccessibilityLawEntry & { continent: string }> = {
    'north-america': {
      continent: 'north-america',
      title: t('accessibility.laws.north-america.title'),
      body: t('accessibility.laws.north-america.body'),
    },
    'south-america': {
      continent: 'south-america',
      title: t('accessibility.laws.south-america.title'),
      body: t('accessibility.laws.south-america.body'),
    },
    europe: {
      continent: 'europe',
      title: t('accessibility.laws.europe.title'),
      body: t('accessibility.laws.europe.body'),
    },
    asia: {
      continent: 'asia',
      title: t('accessibility.laws.asia.title'),
      body: t('accessibility.laws.asia.body'),
    },
    oceania: {
      continent: 'oceania',
      title: t('accessibility.laws.oceania.title'),
      body: t('accessibility.laws.oceania.body'),
    },
    africa: {
      continent: 'africa',
      title: t('accessibility.laws.africa.title'),
      body: t('accessibility.laws.africa.body'),
    },
  };

  const filteredAccessibilityLaws = filterByContinent(allAccessibilityLaws, privacyRegions);

  // i18next returns arrays when returnObjects is true; type-cast for TSC.
  const termsOfUseSections = [
    'acceptance',
    'serviceDescription',
    'dataAccuracy',
    'intellectualProperty',
    'thirdPartyServices',
    'prohibitedConduct',
    'limitationOfLiability',
    'modifications',
    'governingLaw',
    'contact',
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{t('title')}</h1>

      <Grid className="md:auto-rows-[auto]">
        <PageHeaderCard title={t('title')} icon={<Scales weight="duotone" />} />

        {loading ? (
          <>
            <span className="sr-only" role="status">{t('loadingAria')}</span>
            <TileSkeleton className="col-span-full h-32" />
          </>
        ) : content ? (
          <Card footprint="full">
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
            {/* ----------------------------------------------------------------
                1. Terms of Use
            ---------------------------------------------------------------- */}
            <Card footprint="full">
              <CardHeader>
                <CardTitle as="h2">{t('termsOfUse.title')}</CardTitle>
              </CardHeader>
              <CardContent className="!p-0">
                {termsOfUseSections.map((sectionKey) => (
                  <JurisdictionSection
                    key={sectionKey}
                    id={`terms-${sectionKey}`}
                    heading={t(`termsOfUse.sections.${sectionKey}.title`)}
                  >
                    <p>{t(`termsOfUse.sections.${sectionKey}.body`)}</p>
                  </JurisdictionSection>
                ))}
              </CardContent>
            </Card>

            {/* ----------------------------------------------------------------
                2. Privacy Policy — general intro + continent-filtered jurisdictions
            ---------------------------------------------------------------- */}
            <Card footprint="full">
              <CardHeader>
                <CardTitle as="h2">{t('privacy.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                {/* General intro — always shown */}
                <div className="space-y-4 mb-4">
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-1">
                      {t('privacyIntro.dataCollectedTitle')}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t('privacyIntro.dataCollectedBody')}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-1">
                      {t('privacyIntro.visitorDataTitle')}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t('privacyIntro.visitorDataBody')}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-1">
                      {t('privacyIntro.contactTitle')}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t('privacyIntro.contactBody')}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground border-t border-border pt-3">
                    {t('privacyIntro.disclaimerBody')}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Jurisdiction-specific notices — continent filtered */}
            {filteredJurisdictions.length > 0 && (
              <Card footprint="full">
                <CardHeader>
                  <CardTitle as="h2">{t('jurisdictions.sectionLabel')}</CardTitle>
                </CardHeader>
                <CardContent className="!p-0">
                  {filteredJurisdictions.map(([key]) => renderJurisdiction(key))}
                </CardContent>
              </Card>
            )}

            {/* ----------------------------------------------------------------
                3. Accessibility Statement
            ---------------------------------------------------------------- */}
            <Card footprint="full">
              <CardHeader>
                <CardTitle as="h2">{t('accessibility.title')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 mb-4">
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-1">
                      Commitment
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t('accessibility.commitment')}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-1">
                      Conformance Target
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t('accessibility.conformanceTarget')}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-1">
                      Known Limitations
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t('accessibility.knownLimitations')}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-1">
                      Feedback
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t('accessibility.feedback')}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground border-t border-border pt-3">
                    {t('accessibility.operatorDisclaimer')}
                  </p>
                </div>

                {/* Continent-filtered accessibility laws */}
                {filteredAccessibilityLaws.length > 0 && (
                  <div className="border-t border-border -mx-6 mt-2">
                    <div className="px-6 pt-4 pb-1">
                      <h3 className="text-sm font-semibold text-foreground">
                        {t('accessibility.lawsLabel')}
                      </h3>
                    </div>
                    {filteredAccessibilityLaws.map(([key, law]) => (
                      <JurisdictionSection key={key} id={`a11y-${key}`} heading={law.title}>
                        <p>{law.body}</p>
                      </JurisdictionSection>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ----------------------------------------------------------------
                4. Attribution
            ---------------------------------------------------------------- */}
            <Card footprint="full">
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

            {/* ----------------------------------------------------------------
                5. Open Source
            ---------------------------------------------------------------- */}
            <Card footprint="full">
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
      </Grid>
    </div>
  );
}

export default LegalPage;
