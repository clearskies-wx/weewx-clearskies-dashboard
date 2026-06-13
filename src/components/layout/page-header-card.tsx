// page-header-card.tsx — Page-header card primitive (ADR-051 D-A4.4).
//
// A full-footprint half-row card that opens every page.  On the Now page this
// card becomes the hero (station logo + station name) — that content is Track C
// (C1), NOT built here.  On other pages it holds a page title and optional
// inline controls.
//
// A11y contract (rules/coding.md §5.2):
// - Renders a real <h1>…<h6> element (consumer controls level via `as` prop).
// - Default is h1 — the consumer must pass a different level if this card is
//   not the first/top heading on the page to avoid skipping levels.
// - The optional `children` slot is right-aligned inline controls; all
//   interactive controls inside must be keyboard-reachable (Tab-order
//   follows DOM order, which matches visual order here).

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

type PageHeaderCardProps = {
  /** Page or section title — rendered as a semantic heading element. */
  title: string;
  /**
   * Optional page icon rendered to the left of the title block,
   * sized to match the height of the text block.
   */
  icon?: React.ReactNode;
  /**
   * Heading level for the title element.  Defaults to h1.
   * Consumers on pages where h1 is already used must pass a lower level
   * (e.g. as="h2") to maintain document-order heading hierarchy (WCAG 1.3.1).
   */
  as?: HeadingLevel;
  /**
   * Optional right-aligned inline controls slot (the "few controls" pattern
   * from ADR-051).  Rendered in a flex row at the inline-end of the header.
   * All interactive controls passed here must be keyboard-reachable.
   */
  children?: React.ReactNode;
  /** Extra classes passed through to the outer Card. */
  className?: string;
};

/**
 * PageHeaderCard — full-width half-row card for page titles and inline controls.
 *
 * Every page opens with this card (ADR-051 universal card discipline).
 * - `full` footprint: spans all 4 columns on desktop, collapses with the grid.
 * - `rowSpan="half"`: occupies 2 quarter-row tracks, matching the half-row
 *   density from the A4 page-anatomy mockup. Min-height is derived automatically.
 * - Title renders as a real heading element (`as` prop, default h1).
 * - `children` renders right-aligned for "few controls inline" pattern.
 *
 * @example
 * // Page-header with inline controls
 * <PageHeaderCard title="Records" as="h1">
 *   <ThemeToggle />
 * </PageHeaderCard>
 *
 * @example
 * // Page-header without controls
 * <PageHeaderCard title="About" as="h1" />
 */
export function PageHeaderCard({
  title,
  icon,
  as: Heading = 'h1',
  children,
  className,
}: PageHeaderCardProps) {
  return (
    <Card
      footprint="full"
      rowSpan="half"
      className={cn(
        className,
      )}
    >
      <div className="flex flex-1 items-center justify-between gap-4 px-4">
        {/* Icon + title group */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {icon && (
            <div
              className="text-primary flex-shrink-0"
              style={{ fontSize: '2rem', lineHeight: 1 }}
              aria-hidden="true"
            >
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <Heading
              className="font-heading truncate text-xl font-semibold leading-snug"
            >
              {title}
            </Heading>
          </div>
        </div>

        {children && (
          <div className="flex flex-shrink-0 items-center gap-2">
            {children}
          </div>
        )}
      </div>
    </Card>
  );
}
