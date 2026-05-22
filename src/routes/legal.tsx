// legal.tsx — Legal page (/legal)

import { useState } from 'react';
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

// JurisdictionSection implements the WAI-ARIA disclosure pattern:
// https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/
//
// Each section has:
//   - A <button> with aria-expanded + aria-controls for the toggle trigger
//   - A content panel with role="region" + aria-labelledby + a stable id
//
// Heading level: the Privacy Policy card uses h2; these jurisdiction headings
// sit inside the disclosure button below that level. The visible heading is
// rendered as an h3 inside the button so that the document outline is correct
// (h1 page title → h2 Privacy Policy → h3 CCPA / GDPR / Quebec).
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

export function LegalPage() {
  const { t } = useTranslation('legal');
  const { data: content, loading } = useContent('legal');

  // i18next returns arrays when returnObjects is true; type-cast for TSC.
  const ccpaRights = t('jurisdictions.ccpa.rights', { returnObjects: true }) as string[];
  const gdprLegalBases = t('jurisdictions.gdpr.legalBases', { returnObjects: true }) as string[];
  const gdprRights = t('jurisdictions.gdpr.rights', { returnObjects: true }) as string[];
  const quebecRights = t('jurisdictions.quebec.rights', { returnObjects: true }) as string[];

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
          {/* 1. Privacy Policy */}
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

          {/* 2. Jurisdiction-specific toggleable sections (ADR-024 Gap #14)
              Placement: below Privacy Policy, above Data Attribution.
              Pattern: WAI-ARIA disclosure (§5.2 + §5.3 of coding rules). */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">{t('jurisdictions.sectionLabel')}</CardTitle>
            </CardHeader>
            <CardContent className="!p-0">
              {/* CCPA */}
              <JurisdictionSection
                id="ccpa"
                heading={t('jurisdictions.ccpa.heading')}
              >
                <p>{t('jurisdictions.ccpa.p1')}</p>
                <p>{t('jurisdictions.ccpa.p2')}</p>
                <p>{t('jurisdictions.ccpa.p3')}</p>
                <p>{t('jurisdictions.ccpa.p4')}</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                  {ccpaRights.map((right) => (
                    <li key={right}>{right}</li>
                  ))}
                </ul>
                <p>{t('jurisdictions.ccpa.p5')}</p>
                <p className="text-xs text-muted-foreground">{t('jurisdictions.ccpa.p6')}</p>
              </JurisdictionSection>

              {/* GDPR */}
              <JurisdictionSection
                id="gdpr"
                heading={t('jurisdictions.gdpr.heading')}
              >
                <p>{t('jurisdictions.gdpr.p1')}</p>
                <p>{t('jurisdictions.gdpr.p2')}</p>
                <p>{t('jurisdictions.gdpr.p3')}</p>
                <p>{t('jurisdictions.gdpr.p4')}</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                  {gdprLegalBases.map((basis) => (
                    <li key={basis}>{basis}</li>
                  ))}
                </ul>
                <p>{t('jurisdictions.gdpr.p5')}</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                  {gdprRights.map((right) => (
                    <li key={right}>{right}</li>
                  ))}
                </ul>
                <p>{t('jurisdictions.gdpr.p6')}</p>
                <p>{t('jurisdictions.gdpr.p7')}</p>
                <p>{t('jurisdictions.gdpr.p8')}</p>
                <p className="text-xs text-muted-foreground">{t('jurisdictions.gdpr.p9')}</p>
              </JurisdictionSection>

              {/* Quebec Law 25 */}
              <JurisdictionSection
                id="quebec"
                heading={t('jurisdictions.quebec.heading')}
              >
                <p>{t('jurisdictions.quebec.p1')}</p>
                <p>{t('jurisdictions.quebec.p2')}</p>
                <p>{t('jurisdictions.quebec.p3')}</p>
                <p>{t('jurisdictions.quebec.p4')}</p>
                <p>{t('jurisdictions.quebec.p5')}</p>
                <ul className="list-disc list-inside space-y-1 pl-2">
                  {quebecRights.map((right) => (
                    <li key={right}>{right}</li>
                  ))}
                </ul>
                <p>{t('jurisdictions.quebec.p6')}</p>
                <p>{t('jurisdictions.quebec.p7')}</p>
                <p>{t('jurisdictions.quebec.p8')}</p>
                <p className="text-xs text-muted-foreground">{t('jurisdictions.quebec.p9')}</p>
              </JurisdictionSection>
            </CardContent>
          </Card>

          {/* 3. Data Attribution */}
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

          {/* 4. Open-Source Licenses */}
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
