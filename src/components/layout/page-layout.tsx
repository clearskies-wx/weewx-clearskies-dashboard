// page-layout.tsx — Shared page template (ADR-051 amendment).
//
// All pages except Now use this template. It wraps the standard
// Grid + PageHeaderCard composition so individual route files no longer
// need to repeat that boilerplate.
//
// A11y contract (rules/coding.md §5):
// - Renders a visually hidden <h1> that names the page for screen readers.
// - PageHeaderCard renders the same title as a visible heading inside the card.
// - The optional controls slot is wrapped by ControlsStrip which carries
//   a matching aria-label.

import * as React from 'react';
import { Grid } from '@/components/layout/grid';
import { PageHeaderCard } from '@/components/layout/page-header-card';
import { ControlsStrip } from '@/components/layout/controls-strip';

interface PageLayoutProps {
  title: string;
  icon: React.ReactNode;
  controls?: React.ReactNode;
  gridClassName?: string;
  children: React.ReactNode;
}

/**
 * Shared page template per ADR-051 amendment. All pages except Now use this.
 */
export function PageLayout({ title, icon, controls, gridClassName, children }: PageLayoutProps) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{title}</h1>
      <Grid className={gridClassName}>
        <PageHeaderCard title={title} icon={icon} />
        {controls && <ControlsStrip aria-label={`${title} controls`}>{controls}</ControlsStrip>}
        {children}
      </Grid>
    </div>
  );
}
