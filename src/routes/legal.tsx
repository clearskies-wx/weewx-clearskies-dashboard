// legal.tsx — Legal page (/legal)

import { useState } from 'react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../components/ui/card';
import { PageLayout } from '../components/layout/page-layout';
import { Scales, CaretDown } from '@phosphor-icons/react';
import { useBranding } from '../lib/branding-provider';

// ---------------------------------------------------------------------------
// Collapsible card — click header to toggle content
// ---------------------------------------------------------------------------

function CollapsibleCard({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card footprint="full">
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
      >
        <div className="flex items-center justify-between w-full">
          <CardTitle as="h2">{title}</CardTitle>
          <CaretDown
            weight="bold"
            className={`size-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </div>
      </CardHeader>
      {open && <CardContent className="px-6 py-5">{children}</CardContent>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Continent filtering
// ---------------------------------------------------------------------------

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
// Text hierarchy — section headings and body SMALLER than card title (0.82rem)
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-foreground mt-6 first:mt-0">
      {children}
    </h3>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground/80 leading-loose mt-3 mb-4">
      {children}
    </p>
  );
}

function BodySmall({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.65rem] text-muted-foreground/70 leading-relaxed mt-1">
      {children}
    </p>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-0.5 pl-2 text-xs text-muted-foreground mt-1">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Jurisdiction renderers
// ---------------------------------------------------------------------------

interface JurisdictionEntry {
  continent: string;
  heading: string;
}

interface AccessibilityLawEntry {
  title: string;
  body: string;
}

function CcpaSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  const rights = t(`jurisdictions.${jKey}.rights`, { returnObjects: true }) as string[];
  return (
    <div>
      <SectionHeading>{t(`jurisdictions.${jKey}.heading`)}</SectionHeading>
      <Body>{t(`jurisdictions.${jKey}.p1`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p2`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p3`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p4`)}</Body>
      <BulletList items={rights} />
      <Body>{t(`jurisdictions.${jKey}.p5`)}</Body>
      <BodySmall>{t(`jurisdictions.${jKey}.p6`)}</BodySmall>
    </div>
  );
}

function CaloppaSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  return (
    <div>
      <SectionHeading>{t(`jurisdictions.${jKey}.heading`)}</SectionHeading>
      <Body>{t(`jurisdictions.${jKey}.p1`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p2`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p3`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p4`)}</Body>
      <BodySmall>{t(`jurisdictions.${jKey}.p5`)}</BodySmall>
    </div>
  );
}

function GdprSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  const legalBases = t(`jurisdictions.${jKey}.legalBases`, { returnObjects: true }) as string[];
  const rights = t(`jurisdictions.${jKey}.rights`, { returnObjects: true }) as string[];
  return (
    <div>
      <SectionHeading>{t(`jurisdictions.${jKey}.heading`)}</SectionHeading>
      <Body>{t(`jurisdictions.${jKey}.p1`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p2`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p3`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p4`)}</Body>
      <BulletList items={legalBases} />
      <Body>{t(`jurisdictions.${jKey}.p5`)}</Body>
      <BulletList items={rights} />
      <Body>{t(`jurisdictions.${jKey}.p6`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p7`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p8`)}</Body>
      <BodySmall>{t(`jurisdictions.${jKey}.p9`)}</BodySmall>
    </div>
  );
}

function UkGdprSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  const legalBases = t(`jurisdictions.${jKey}.legalBases`, { returnObjects: true }) as string[];
  const rights = t(`jurisdictions.${jKey}.rights`, { returnObjects: true }) as string[];
  return (
    <div>
      <SectionHeading>{t(`jurisdictions.${jKey}.heading`)}</SectionHeading>
      <Body>{t(`jurisdictions.${jKey}.p1`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p2`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p3`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p4`)}</Body>
      <BulletList items={legalBases} />
      <Body>{t(`jurisdictions.${jKey}.p5`)}</Body>
      <BulletList items={rights} />
      <Body>{t(`jurisdictions.${jKey}.p6`)}</Body>
      <BodySmall>{t(`jurisdictions.${jKey}.p7`)}</BodySmall>
    </div>
  );
}

function QuebecSection({ jKey }: { jKey: string }) {
  const { t } = useTranslation('legal');
  const rights = t(`jurisdictions.${jKey}.rights`, { returnObjects: true }) as string[];
  return (
    <div>
      <SectionHeading>{t(`jurisdictions.${jKey}.heading`)}</SectionHeading>
      <Body>{t(`jurisdictions.${jKey}.p1`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p2`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p3`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p4`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p5`)}</Body>
      <BulletList items={rights} />
      <Body>{t(`jurisdictions.${jKey}.p6`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p7`)}</Body>
      <Body>{t(`jurisdictions.${jKey}.p8`)}</Body>
      <BodySmall>{t(`jurisdictions.${jKey}.p9`)}</BodySmall>
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
    <div>
      <SectionHeading>{t(`jurisdictions.${jKey}.heading`)}</SectionHeading>
      {paragraphs.map((pKey, idx) => {
        if (hasRights && idx === paragraphs.length - 2) {
          return (
            <React.Fragment key={pKey}>
              <Body>{t(`jurisdictions.${jKey}.${pKey}`)}</Body>
              <BulletList items={rights} />
            </React.Fragment>
          );
        }
        if (idx === paragraphs.length - 1) {
          return <BodySmall key={pKey}>{t(`jurisdictions.${jKey}.${pKey}`)}</BodySmall>;
        }
        return <Body key={pKey}>{t(`jurisdictions.${jKey}.${pKey}`)}</Body>;
      })}
    </div>
  );
}

function renderJurisdiction(key: string): React.ReactNode {
  switch (key) {
    case 'ccpa': return <CcpaSection key={key} jKey={key} />;
    case 'caloppa': return <CaloppaSection key={key} jKey={key} />;
    case 'gdpr': return <GdprSection key={key} jKey={key} />;
    case 'ukgdpr': return <UkGdprSection key={key} jKey={key} />;
    case 'quebec': return <QuebecSection key={key} jKey={key} />;
    case 'lgpd': return <GenericJurisdictionSection key={key} jKey={key} paragraphs={['p1','p2','p3','p4','p5','p6']} hasRights />;
    case 'appi': return <GenericJurisdictionSection key={key} jKey={key} paragraphs={['p1','p2','p3','p4','p5','p6','p7']} hasRights />;
    case 'dpdp': return <GenericJurisdictionSection key={key} jKey={key} paragraphs={['p1','p2','p3','p4','p5','p6']} hasRights />;
    case 'australiaPrivacy': return <GenericJurisdictionSection key={key} jKey={key} paragraphs={['p1','p2','p3','p4','p5','p6']} hasRights />;
    case 'popia': return <GenericJurisdictionSection key={key} jKey={key} paragraphs={['p1','p2','p3','p4','p5','p6']} hasRights />;
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function LegalPage() {
  const { t } = useTranslation('legal');
  const branding = useBranding();
  const privacyRegions = branding.privacyRegions;

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

  const allAccessibilityLaws: Record<string, AccessibilityLawEntry & { continent: string }> = {
    'north-america': { continent: 'north-america', title: t('accessibility.laws.north-america.title'), body: t('accessibility.laws.north-america.body') },
    'south-america': { continent: 'south-america', title: t('accessibility.laws.south-america.title'), body: t('accessibility.laws.south-america.body') },
    europe: { continent: 'europe', title: t('accessibility.laws.europe.title'), body: t('accessibility.laws.europe.body') },
    asia: { continent: 'asia', title: t('accessibility.laws.asia.title'), body: t('accessibility.laws.asia.body') },
    oceania: { continent: 'oceania', title: t('accessibility.laws.oceania.title'), body: t('accessibility.laws.oceania.body') },
    africa: { continent: 'africa', title: t('accessibility.laws.africa.title'), body: t('accessibility.laws.africa.body') },
  };
  const filteredAccessibilityLaws = filterByContinent(allAccessibilityLaws, privacyRegions);

  const termsOfUseSections = [
    'acceptance', 'serviceDescription', 'dataAccuracy', 'intellectualProperty',
    'thirdPartyServices', 'prohibitedConduct', 'limitationOfLiability',
    'modifications', 'governingLaw', 'contact',
  ] as const;

  return (
    <PageLayout title={t('title')} icon={<Scales weight="duotone" />}>
      <CollapsibleCard title={t('termsOfUse.title')}>
        <p className="text-[0.65rem] text-muted-foreground/70 mb-2">{t('termsOfUse.lastUpdated')}</p>
        {termsOfUseSections.map((sectionKey) => (
          <div key={sectionKey}>
            <SectionHeading>{t(`termsOfUse.sections.${sectionKey}.title`)}</SectionHeading>
            <Body>{t(`termsOfUse.sections.${sectionKey}.body`)}</Body>
          </div>
        ))}
      </CollapsibleCard>

      <CollapsibleCard title={t('privacy.title')}>
        <SectionHeading>{t('privacyIntro.dataCollectedTitle')}</SectionHeading>
        <Body>{t('privacyIntro.dataCollectedBody')}</Body>

        <SectionHeading>{t('privacyIntro.visitorDataTitle')}</SectionHeading>
        <Body>{t('privacyIntro.visitorDataBody')}</Body>

        <SectionHeading>{t('privacyIntro.contactTitle')}</SectionHeading>
        <Body>{t('privacyIntro.contactBody')}</Body>

        {filteredJurisdictions.length > 0 && (
          <>
            {filteredJurisdictions.map(([key]) => renderJurisdiction(key))}
          </>
        )}

        <BodySmall>{t('privacyIntro.disclaimerBody')}</BodySmall>
      </CollapsibleCard>

      <CollapsibleCard title={t('accessibility.title')}>
        <SectionHeading>Commitment</SectionHeading>
        <Body>{t('accessibility.commitment')}</Body>

        <SectionHeading>Conformance Target</SectionHeading>
        <Body>{t('accessibility.conformanceTarget')}</Body>

        <SectionHeading>Known Limitations</SectionHeading>
        <Body>{t('accessibility.knownLimitations')}</Body>

        <SectionHeading>Feedback</SectionHeading>
        <Body>{t('accessibility.feedback')}</Body>

        {filteredAccessibilityLaws.length > 0 && filteredAccessibilityLaws.map(([key, law]) => (
          <div key={key}>
            <SectionHeading>{law.title}</SectionHeading>
            <Body>{law.body}</Body>
          </div>
        ))}

        <BodySmall>{t('accessibility.operatorDisclaimer')}</BodySmall>
      </CollapsibleCard>

      <CollapsibleCard title={t('openSource.title')}>
        <Body>{t('openSource.body')}</Body>
        <p className="mt-2">
          <a
            href="https://github.com/inguy24/weewx-clearskies-stack"
            target="_blank"
            rel="noopener"
            className="text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            View project on GitHub ↗
          </a>
        </p>
      </CollapsibleCard>
    </PageLayout>
  );
}

export default LegalPage;
