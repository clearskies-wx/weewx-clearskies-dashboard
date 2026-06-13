// page-header-card.test.tsx — Unit tests for PageHeaderCard (ADR-051 D-A4.4).
//
// A11y-critical contracts tested here:
// - Title renders as a real heading element (not a div) — WCAG 1.3.1.
// - Default heading level is h1; consumer can override via `as` prop.
// - No heading level is skipped by the component itself.
// - Children (controls slot) render right-aligned.
// - full footprint is applied to the outer Card.
//
// Note: info prop was removed in T2.2 (Phase 2 grid normalisation). Tests for
// info text have been removed accordingly.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PageHeaderCard } from './page-header-card';

describe('PageHeaderCard', () => {
  // -------------------------------------------------------------------------
  // Heading semantics (a11y load-bearing — WCAG 1.3.1)
  // -------------------------------------------------------------------------

  it('renders the title as an h1 by default', () => {
    const { getByRole } = render(<PageHeaderCard title="Now" />);
    const heading = getByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Now');
  });

  it('renders the title as h2 when as="h2"', () => {
    const { getByRole } = render(<PageHeaderCard title="Records" as="h2" />);
    const heading = getByRole('heading', { level: 2 });
    expect(heading.textContent).toBe('Records');
  });

  it('renders the title as h3 when as="h3"', () => {
    const { getByRole } = render(<PageHeaderCard title="Section" as="h3" />);
    const heading = getByRole('heading', { level: 3 });
    expect(heading.textContent).toBe('Section');
  });

  it('renders the title as h4 when as="h4"', () => {
    const { getByRole } = render(<PageHeaderCard title="Sub" as="h4" />);
    expect(getByRole('heading', { level: 4 }).textContent).toBe('Sub');
  });

  it('renders the title as h5 when as="h5"', () => {
    const { getByRole } = render(<PageHeaderCard title="Sub" as="h5" />);
    expect(getByRole('heading', { level: 5 }).textContent).toBe('Sub');
  });

  it('renders the title as h6 when as="h6"', () => {
    const { getByRole } = render(<PageHeaderCard title="Sub" as="h6" />);
    expect(getByRole('heading', { level: 6 }).textContent).toBe('Sub');
  });

  // -------------------------------------------------------------------------
  // Controls slot (children)
  // -------------------------------------------------------------------------

  it('renders children in the controls slot', () => {
    const { getByText } = render(
      <PageHeaderCard title="Now">
        <button>Toggle theme</button>
      </PageHeaderCard>,
    );
    expect(getByText('Toggle theme')).toBeDefined();
  });

  it('renders without children (no error)', () => {
    expect(() => render(<PageHeaderCard title="Now" />)).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Footprint — outer Card must carry full footprint
  // -------------------------------------------------------------------------

  it('outer card has the full footprint class (lg:col-span-4)', () => {
    const { container } = render(<PageHeaderCard title="Now" />);
    // The outermost element is the Card div
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('lg:col-span-4');
  });

  // -------------------------------------------------------------------------
  // className passthrough
  // -------------------------------------------------------------------------

  it('merges extra className onto the outer card', () => {
    const { container } = render(
      <PageHeaderCard title="Now" className="extra-header-class" />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('extra-header-class');
  });
});
