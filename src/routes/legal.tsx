// legal.tsx — Legal page (/legal)

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { PageLayout } from '../components/layout/page-layout';
import { Scales } from '@phosphor-icons/react';
import { useBranding } from '../lib/branding-provider';

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
// Section heading helper — visual break inside a card, NOT expandable
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-foreground mt-4 first:mt-0">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Jurisdiction renderers — flowing paragraphs, no accordions
// ---------------------------------------------------------------------------

function CcpaSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  const rights = t(`jurisdictions.${jKey}.rights`, { returnObjects: true }) as string[];
  return (
    <div className="space-y-1">
      <SectionHeading>{t(`jurisdictions.${jKey}.heading`)}</SectionHeading>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p1`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p2`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p3`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p4`)}</p>
      <ul className="list-disc list-inside space-y-1 pl-2 text-sm text-muted-foreground mt-1">
        {rights.map((right) => (
          <li key={right}>{right}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p5`)}</p>
      <p className="text-xs text-muted-foreground mt-1">{t(`jurisdictions.${jKey}.p6`)}</p>
    </div>
  );
}

function CaloppaSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  return (
    <div className="space-y-1">
      <SectionHeading>{t(`jurisdictions.${jKey}.heading`)}</SectionHeading>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p1`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p2`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p3`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p4`)}</p>
      <p className="text-xs text-muted-foreground mt-1">{t(`jurisdictions.${jKey}.p5`)}</p>
    </div>
  );
}

function GdprSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  const legalBases = t(`jurisdictions.${jKey}.legalBases`, { returnObjects: true }) as string[];
  const rights = t(`jurisdictions.${jKey}.rights`, { returnObjects: true }) as string[];
  return (
    <div className="space-y-1">
      <SectionHeading>{t(`jurisdictions.${jKey}.heading`)}</SectionHeading>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p1`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p2`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p3`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p4`)}</p>
      <ul className="list-disc list-inside space-y-1 pl-2 text-sm text-muted-foreground mt-1">
        {legalBases.map((basis) => (
          <li key={basis}>{basis}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p5`)}</p>
      <ul className="list-disc list-inside space-y-1 pl-2 text-sm text-muted-foreground mt-1">
        {rights.map((right) => (
          <li key={right}>{right}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p6`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p7`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p8`)}</p>
      <p className="text-xs text-muted-foreground mt-1">{t(`jurisdictions.${jKey}.p9`)}</p>
    </div>
  );
}

function UkGdprSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  const legalBases = t(`jurisdictions.${jKey}.legalBases`, { returnObjects: true }) as string[];
  const rights = t(`jurisdictions.${jKey}.rights`, { returnObjects: true }) as string[];
  return (
    <div className="space-y-1">
      <SectionHeading>{t(`jurisdictions.${jKey}.heading`)}</SectionHeading>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p1`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p2`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p3`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p4`)}</p>
      <ul className="list-disc list-inside space-y-1 pl-2 text-sm text-muted-foreground mt-1">
        {legalBases.map((basis) => (
          <li key={basis}>{basis}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p5`)}</p>
      <ul className="list-disc list-inside space-y-1 pl-2 text-sm text-muted-foreground mt-1">
        {rights.map((right) => (
          <li key={right}>{right}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p6`)}</p>
      <p className="text-xs text-muted-foreground mt-1">{t(`jurisdictions.${jKey}.p7`)}</p>
    </div>
  );
}

function QuebecSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  const rights = t(`jurisdictions.${jKey}.rights`, { returnObjects: true }) as string[];
  return (
    <div className="space-y-1">
      <SectionHeading>{t(`jurisdictions.${jKey}.heading`)}</SectionHeading>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p1`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p2`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p3`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p4`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p5`)}</p>
      <ul className="list-disc list-inside space-y-1 pl-2 text-sm text-muted-foreground mt-1">
        {rights.map((right) => (
          <li key={right}>{right}</li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p6`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p7`)}</p>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">{t(`jurisdictions.${jKey}.p8`)}</p>
      <p className="text-xs text-muted-foreground mt-1">{t(`jurisdictions.${jKey}.p9`)}</p>
    </div>
  );
}

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
    <div className="space-y-1">
      <SectionHeading>{t(`jurisdictions.${jKey}.heading`)}</SectionHeading>
      {paragraphs.map((pKey, idx) => {
        if (hasRights && idx === paragraphs.length - 2) {
          return (
            <React.Fragment key={pKey}>
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                {t(`jurisdictions.${jKey}.${pKey}`)}
              </p>
              <ul className="list-disc list-inside space-y-1 pl-2 text-sm text-muted-foreground mt-1">
                {rights.map((right) => (
                  <li key={right}>{right}</li>
                ))}
              </ul>
            </React.Fragment>
          );
        }
        if (idx === paragraphs.length - 1) {
          return (
            <p key={pKey} className="text-xs text-muted-foreground mt-1">
              {t(`jurisdictions.${jKey}.${pKey}`)}
            </p>
          );
        }
        return (
          <p key={pKey} className="text-sm text-muted-foreground leading-relaxed mt-1">
            {t(`jurisdictions.${jKey}.${pKey}`)}
          </p>
        );
      })}
    </div>
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
  const branding = useBranding();
  const privacyRegions = branding.privacyRegions;

  // Build typed jurisdiction map for filtering.
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
    <PageLayout title={t('title')} icon={<Scales weight="duotone" />}>
      {/* ----------------------------------------------------------------
          1. Terms of Use
      ---------------------------------------------------------------- */}
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h2">{t('termsOfUse.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">{t('termsOfUse.lastUpdated')}</p>
          <div className="space-y-4">
            {termsOfUseSections.map((sectionKey) => (
              <div key={sectionKey}>
                <h3 className="text-sm font-semibold text-foreground mt-4 first:mt-0">
                  {t(`termsOfUse.sections.${sectionKey}.title`)}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                  {t(`termsOfUse.sections.${sectionKey}.body`)}
                </p>
              </div>
            ))}
          </div>
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
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {t('privacyIntro.dataCollectedTitle')}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                {t('privacyIntro.dataCollectedBody')}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {t('privacyIntro.visitorDataTitle')}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                {t('privacyIntro.visitorDataBody')}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {t('privacyIntro.contactTitle')}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                {t('privacyIntro.contactBody')}
              </p>
            </div>
          </div>

          {/* Jurisdiction-specific notices — continent filtered, flowing */}
          {filteredJurisdictions.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border space-y-6">
              <h3 className="text-sm font-semibold text-foreground">
                {t('jurisdictions.sectionLabel')}
              </h3>
              {filteredJurisdictions.map(([key]) => renderJurisdiction(key))}
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
            {t('privacyIntro.disclaimerBody')}
          </p>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------
          3. Accessibility Statement
      ---------------------------------------------------------------- */}
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h2">{t('accessibility.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Commitment</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                {t('accessibility.commitment')}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Conformance Target</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                {t('accessibility.conformanceTarget')}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Known Limitations</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                {t('accessibility.knownLimitations')}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Feedback</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                {t('accessibility.feedback')}
              </p>
            </div>
          </div>

          {/* Continent-filtered accessibility laws — flowing, not accordion */}
          {filteredAccessibilityLaws.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border space-y-4">
              <h3 className="text-sm font-semibold text-foreground">
                {t('accessibility.lawsLabel')}
              </h3>
              {filteredAccessibilityLaws.map(([key, law]) => (
                <div key={key}>
                  <h3 className="text-sm font-semibold text-foreground mt-4 first:mt-0">
                    {law.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                    {law.body}
                  </p>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border">
            {t('accessibility.operatorDisclaimer')}
          </p>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------
          4. Open Source
      ---------------------------------------------------------------- */}
      <Card footprint="full">
        <CardHeader>
          <CardTitle as="h2">Open Source</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t('openSource.body')}
          </p>
          <p className="mt-3">
            <a
              href="https://github.com/inguy24/weewx-clearskies-stack"
              target="_blank"
              rel="noopener"
              className="text-sm font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              View project repository on GitHub
            </a>
          </p>
        </CardContent>
      </Card>
    </PageLayout>
  );
}

export default LegalPage;
